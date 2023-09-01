//Matrix
const {Matrix} = require("ml-matrix")

//MongoDB
const MongoClient = require('mongodb').MongoClient;
const url = 'mongodb://localhost:27017/';
const dbName = 'a1db';
const client = new MongoClient(url);
let db;

//Crawler
const Crawler = require("crawler");
const baseUrl = "https://people.scs.carleton.ca/~davidmckenney/fruitgraph"
const seedPage = "N-0"
let fruitQueued = {}; 
let cbcQueued = {}; 

client.connect(function(err) {
    if(err) throw err;
    console.log("Connected to database.");

    db = client.db(dbName);	

    //Crawl Fruit Example Site
    //fruitCrawler.queue(`${baseUrl}/${seedPage}.html`);
    //fruitQueued[seedPage] = true;  

    //Crawl Personal Example Site
    cbcCrawler.queue("https://www.cbc.ca/sports/basketball/nba");
    cbcQueued["https://www.cbc.ca/sports/basketball/nba"] = true;  
});

const fruitCrawler = new Crawler({
    callback: async function (error, response, done) {
        if (error) {
            console.log(error);
            done();
        }

        let $ = response.$;
        
        let newPage = {
            url: "",
            title: "", //ID
            incomingLinks: [],
            outgoingLinks: [],
            fruits: [],
            pageRank: 0
        }

        //Id
        let title = $("title").text()
        newPage["title"] = title;

        //Fruits
        let fruits = ($("p").text()).trim().split('\n')
        newPage.fruits = fruits;

        //Url
        newPage["url"] = `${baseUrl}/${title}.html`

        //Scrape all links
        $("a").each(function(i, link){
            let nextPage = $(link).text(); 
            let outgoingLink = `${baseUrl}/${nextPage}.html`;
            newPage.outgoingLinks.push(outgoingLink);

            //Update incoming links
            const query = { title: nextPage };
            const update = {$set: {title: nextPage}, $push: {"incomingLinks": newPage["url"]}};
            const options = { upsert: true };
            db.collection("pages").updateOne(query, update, options);

            //Queue next link
            if(!fruitQueued.hasOwnProperty(nextPage)) {
                fruitCrawler.queue(outgoingLink);
                fruitQueued[nextPage] = true;                
            }
        })

        //Update page
        const query = { title: newPage.title };
        const update = { $set: { url: newPage.url, title: newPage.title, outgoingLinks: newPage.outgoingLinks, fruits: newPage.fruits}};
        const options = { upsert: true };
        await db.collection("pages").updateOne(query, update, options);
        done();
    }
});

const cbcCrawler = new Crawler({
    callback: async function (error, response, done) {        
        if (error) {
            console.log(error);
            done();
        }
        let $ = response.$;

        let newDocument = {
            url: "",
            headLine: "",
            labels: [],
            header: "",
            story: "",
            incomingLinks: [],
            outgoingLinks: [],
            pageRank: 0
        }

        //Headline
        newDocument.headLine = $('title').text();
        newDocument.url = $('meta[property="vf:url"]').attr('content');
        newDocument.labels = $('span[class="detail-link-label sclt-storySectionLink"]').children().text().split("·");
        newDocument.header = $('.deck').text();

        $('div[class="story"]').find("div > p").each((index,element) => {
            newDocument.story = newDocument.story + $(element).text();
        });

        $("a").each(function(i, link){
            let url = $(link).attr('href').split("?")[0];

            if(!url.startsWith("/sports/basketball/nba") && !url.startsWith("https://www.cbc.ca/sports/basketball/nba")) {
                return;
            }
			

            if(url.charAt(0) == "/") {
                url = "https://www.cbc.ca" + url;           
            }

            //Max pages to crawl
            if(Object.keys(cbcQueued).length >= 1000 && !cbcQueued.hasOwnProperty(url)) {
                return;
            }
            //Trending links (every article has the same ones)
            const linkClass = $(link).attr("class");

            if(linkClass && linkClass.includes("headlineLink")) {
                return;
            }

            //New Link 
            if(!newDocument.outgoingLinks.includes(url)) {
                newDocument.outgoingLinks.push(url);

                //Update incoming links
                const query = { url: url };
                const update = { $set: {url: url}, $push: {"incomingLinks": newDocument["url"]}};
                const options = { upsert: true };
                db.collection("articles").updateOne(query, update, options);
            }

            //Queue next link
            if(!cbcQueued.hasOwnProperty(url)) {
                cbcCrawler.queue(url);
                cbcQueued[url] = true;                  
            }
        });

        //Update page
        const query = { url: newDocument.url };
        const update = { $set: {url: newDocument.url, headLine: newDocument.headLine, labels: newDocument.labels, header: newDocument.header, story: newDocument.story, outgoingLinks: newDocument.outgoingLinks}};
        const options = { upsert: true };
        await db.collection("articles").updateOne(query, update, options);

        done();
    }
})

fruitCrawler.on('drain', async () => {
    console.log("Done crawling fruit example...");

    //Page Rank
    const collection = db.collection("pages");
    await pageRankCalculation(collection);
    console.log("Page ranks added to fruit example...")
    //client.close();
})  

cbcCrawler.on('drain', async () => {
    console.log("Done crawling cbc example...");
    
    //Page Rank
    const collection = db.collection("articles");
    await pageRankCalculation(collection);
    console.log("Page ranks added to personal example...")
    //client.close();
})  

async function pageRankCalculation(collection) {
    const documentList = await collection.find({}).toArray();
    let mapping = {};
    
    documentList.forEach( (document,i) => {
        mapping[document.url] = i;
    })

    let P = buildAdjMatrix(documentList, mapping);
    probabilityMatrix(P);
    let pageRanks = powerIteration(P);
    await updatePageRanks(documentList, pageRanks, mapping, collection);
}

function buildAdjMatrix(documentList, mapping) {
    let N = documentList.length;
    let P = Matrix.zeros(N, N);

    documentList.forEach(document => {
        let row = mapping[document.url];
        let value;
                
        if(document.outgoingLinks.length > 0) {
            value = 1/document.outgoingLinks.length;
        } else {
            value = 1/N;
        }

        document.outgoingLinks.forEach(link => {
            let col = mapping[link];
            P.set(row,col, value)
        })
    });

    return P;
} 

function probabilityMatrix(P) {
    let alpha = 0.1;

    for(let i = 0; i < P.rows; i++) {
        for(let j = 0; j < P.columns; j++) {
            P.set(i, j, P.get(i,j) * (1-alpha));
            P.set(i, j, P.get(i,j) + (alpha/P.columns));
        }
    }
}

function powerIteration(P) {
    let x = Matrix.eye(1,P.columns);
    let y = x.mmul(P);

    while(distance(x,y) >= 0.0001) {
        x = y;
        y = x.mmul(P);
    }

    return y;
}

function distance(x,y) {
    let sum = 0;
    for(let i = 0; i < x.columns; i++) {
        sum += (x.get(0,i)-y.get(0,i)) ** 2
    }

    return Math.sqrt(sum);
}

async function updatePageRanks(documentList, pageRanks, mapping, collection) {
    for(document of documentList) {
        let id = mapping[document.url];
        let pageRank = pageRanks.get(0, id);

        //update in database
        let filter = {"_id": document["_id"]};
        let updateDoc = {$set: {
            "pageRank": pageRank
        }};
        let options = {};
        await collection.updateOne(filter,updateDoc,options)
    }
}