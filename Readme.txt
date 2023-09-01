COMP4106 Assignment 1
Author: Hamza Osman

Installation instructions:
1. Ensure Node and Mongo are installed
2. Download node packages using `npm install`
3. Scrape the sites using `node crawler.js`
4. Start the program with `npm start`

Endpoints:
The lab can be accessed at 'http://localhost:3001/'
The fruits endpoint can be accessed at 'http://localhost:3001/fruits'
The personal website endpoint can be accessed at 'http://localhost:3001/personal'. The personal website I chose is cbcnews.ca, and I only crawled the articles pertaining to the NBA.

Both search engines follow the same REST API. You make a GET request to either the 'fruits' or 'personal' endpoint to make a search. The query parameters are as follows:
"q" : a string representing the search query the user has entered, which may contain multiple words
"boost": either true or false, indicating whether each page should be boosted in the search results using its PageRank score
"limit": a number specifying how many results the user wants returned (minimum 1, maximum 50, default 10)