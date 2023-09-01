const express = require("express");
const router = express.Router();
const elasticlunr = require("elasticlunr");
const ObjectId = require("mongodb").ObjectId;

router.param("articleId", (req,res,next) => {
    if(!ObjectId.isValid(req.params.articleId)) {
        res.status(404).send("Unknown order ID");
    }

    req.app.locals.db.collection("articles").findOne({_id: ObjectId(req.params.articleId)}, function(err, result) {
        if(err){
			res.status(500).send("Error finding page.");
			return;
		}

        if(!result) {
            res.status(404).send("Unknown page ID.");
            return;
        }

        req.article = result;
        next();
    });
})

router.get("/", [validateSearch, indexDatabase, findResults, returnResults]);
router.get("/:articleId", (req,res) => {
    let freqs = {}

    let story = req.article.story.replace(/[^\w\-\']/g, " ").replace(/\s+/g, " ").split(/\s/)

    story.forEach(word => {
        if(!freqs[word]) {
            freqs[word] = 0;
        }

        freqs[word] = freqs[word] +1;
    })
    
    let sortable = [];
    
    for (var word in freqs) {
        sortable.push([word, freqs[word]]);
    }

    sortable.sort(function(a, b) {
        return b[1] - a[1];
    });

    res.format({
        "text/html": () => {
            res.status(200).render("article", {article: req.article, freqs: sortable});
        },        
        'application/json': () => {
            res.status(200).json(req.article);
        } ,
        default () {
            res.status(406).send('Unknown format');
        }
    })  
});

function validateSearch(req,res,next) {

    if(Object.keys(req.query).length === 0) {
        res.format({
            "text/html": () => {
                res.status(200).render("articles", {topResults: []});
            },        
            'application/json': () => {
                res.status(200).json();
            } ,
            default () {
                res.status(406).send('Unknown format');
            }
        })  
        return;
    }

    if(!req.query.q) {
        res.status(404).send("Missing search query");
        return;
    }
    
    if(!req.query.limit) {
        req.query.limit = 10;
    }
    
    const parsedLimit = Number.parseInt(req.query.limit);
    if (Number.isNaN(parsedLimit)) {
        res.status(404).send("Invalid limit");
        return;
    }
    
    if(req.query.limit < 1 || req.query.limit > 50) {
        res.status(404).send("Limit must be between 1 and 50");
        return;
    }
    
    if(!req.query.boost) {
        req.query.boost = false;
    }
    
    next();
}

async function indexDatabase(req,res,next) {
    const index = elasticlunr(function() {
        this.addField('headLine');
        this.addField('labels');
        this.addField('header');
        this.addField('story');
        this.setRef('_id');
    });

    const documentList = await req.app.locals.db.collection("articles").find({}).toArray();

    documentList.forEach(document => {
        index.addDoc(document);
    });

    req.index = index;
    next();
}

async function findResults(req,res,next) {
    const indexResults = req.index.search(req.query.q, {});
    let topResults = [];

    for(indexed of indexResults) {
        document = await req.app.locals.db.collection("articles").findOne({_id: ObjectId(indexed.ref)});

        result = {
            id: document["_id"],
            url: document.url,
            title: document.headLine,
            score: indexed.score,
            pageRank: document.pageRank
        }

        if(req.query.boost === true || req.query.boost === 'true') {
            result.score = result.score * document.pageRank;
        }

        topResults.push(result);
    }

    topResults.sort( (a,b) => {
        return b.score - a.score;
    });

    req.topResults = topResults.slice(0,req.query.limit);;
    
    next();
}

function returnResults(req,res) {
    res.format({
        "text/html": () => {
            res.status(200).render("articles", {topResults: req.topResults});
        },        
        'application/json': () => {
            res.status(200).json(req.topResults);
        } ,
        default () {
            res.status(406).send('Unknown format');
        }
    })  

    return;
}

module.exports = router;
