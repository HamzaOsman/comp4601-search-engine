const express = require("express");
const router = express.Router();
const elasticlunr = require("elasticlunr");
const ObjectId = require("mongodb").ObjectId;

router.param("pageId", (req,res,next) => {
    if(!ObjectId.isValid(req.params.pageId)) {
        res.status(404).send("Unknown order ID");
    }

    req.app.locals.db.collection("pages").findOne({_id: ObjectId(req.params.pageId)}, function(err, result) {
        if(err){
			res.status(500).send("Error finding page.");
			return;
		}

        if(!result) {
            res.status(404).send("Unknown page ID.");
            return;
        }

        req.page = result;
        next();
    });
})

router.get("/", [validateSearch, indexDatabase, findResults, returnResults]);
router.get("/:pageId", (req,res) => {

    let freqs = {}

    req.page.fruits.forEach(fruit => {
        if(!freqs[fruit]) {
            freqs[fruit] = 0;
        }

        freqs[fruit] = freqs[fruit] +1;
    })
    
    let sortable = [];
    for (var fruit in freqs) {
        sortable.push([fruit, freqs[fruit]]);
    }

    sortable.sort(function(a, b) {
        return b[1] - a[1];
    });

    res.format({
        "text/html": () => {
            res.status(200).render("fruit", {page: req.page, freqs: sortable});
        },        
        'application/json': () => {
            res.status(200).json(req.page);
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
                res.status(200).render("fruits", {topResults: []});
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
        this.addField('title');
        this.addField('fruits');
        this.setRef('_id');
    });

    const documentList = await req.app.locals.db.collection("pages").find({}).toArray();

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
        page = await req.app.locals.db.collection("pages").findOne({_id: ObjectId(indexed.ref)});

        result = {
            id: page["_id"],
            url: page.url,
            title: page.title,
            score: indexed.score,
            pageRank: page.pageRank
        }

        if(req.query.boost === true || req.query.boost === 'true') {
            result.score = result.score * page.pageRank;
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
            res.status(200).render("fruits", {topResults: req.topResults});
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
