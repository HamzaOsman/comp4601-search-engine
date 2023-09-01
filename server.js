//Express
const express = require('express');
const app = express();
const port = 3001;

app.set('view engine', 'pug');
app.set('views', "./views");

//MiddleWare
app.use(express.json());
app.use(express.urlencoded({extended:false}));

//Routers
const fruitRouter = require("./fruits-router");
const personalRouter = require("./personal-router");

app.use("/fruits", fruitRouter);
app.use("/personal", personalRouter);

//MongoDB
const MongoClient = require('mongodb').MongoClient;
const url = 'mongodb://localhost:27017/';
const dbName = 'a1db';
const client = new MongoClient(url);

client.connect(function(err) {
    if(err) throw err;
    console.log("Connected to database.");

    app.locals.db = client.db(dbName);

    //Only start listening now, when we know the database is available
	app.listen(port, () => {
        console.log(`Listening on port ${port}...`)
    })
});

app.get("/", (req,res,next) => {
    res.status(200).render("index");
})