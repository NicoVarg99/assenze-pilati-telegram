const https = require('https');
const parse5 = require('parse5');
var cheerio = require('cheerio'),
cheerioTableparser = require('cheerio-tableparser');
const document = parse5.parse('<!DOCTYPE html><html><head></head><body>Hi there!</body></html>');

var requestedClass = "5INTA";

function transpose(a) {

  // Calculate the width and height of the Array
  var w = a.length || 0;
  var h = a[0] instanceof Array ? a[0].length : 0;

  // In case it is a zero matrix, no transpose routine needed.
  if(h === 0 || w === 0) { return []; }

  /**
   * @var {Number} i Counter
   * @var {Number} j Counter
   * @var {Array} t Transposed data is stored in this array.
   */
  var i, j, t = [];

  // Loop through every item in the outer array (height)
  for(i=0; i<h; i++) {

    // Insert a new row (array)
    t[i] = [];

    // Loop through every item per item in outer array (width)
    for(j=0; j<w; j++) {

      // Save transposed data.
      t[i][j] = a[j][i];
    }
  }

  return t;
}

function deleteRow(arr, row) {
   arr = arr.slice(0); // make copy
   arr.splice(row - 1, 1);
   return arr;
}



var options = {
 hostname: 'www.istitutopilati.it'
 ,port: '443'
 ,path: '/notizie-video-sostituzioni.html'
 ,method: 'GET'
 ,headers: { 'Content-Type': 'application/json' },
 strictSSL: false
};

var req = https.request(options, function(res) {
  var totalData = "";

   res.on('data', function (data) { totalData += data; });

   res.on('end', function () {
        //console.log(data); // I can't parse it because, it's a string. why?
        //console.log(totalData);
        // data = parse5.parse(totalData);
        // data = data.childNodes[1];
        // data = data.childNodes[2]; //body
        // data = data.childNodes; //div class=body
        // //console.log(totalData);

        $ = cheerio.load(totalData);
        cheerioTableparser($);
        var table = $(".textContent table").parsetable(false, false, true);
        //console.log(table);

        //console.log("******************************************************");

        table = transpose(table);

        //console.log("Data length:" + data.length + " rows");

        date = table[0][0];


        righe = table.length;
        var removed = 0;
        for (var i = 0; i < righe - removed; i++) {
          //console.log(table[i][2]);
          if (!table[i][2] || table[i][2] == "CLASSE") {
            //console.log("Remove row " + i);
            table.splice(i, 1);
            i--;
            removed++;
          }
        }


        righe = table.length;

        var resultingTable = [];

        for (var row in table) { //For each row
          if (table[row][2] == requestedClass) { //If curent class = requested class
            resultingTable.push(table[row]);
          }
        }

        console.log("Validità: " + date);

       for (var j = 0; j < resultingTable.length; j++) { //For each column
         console.log("Col" + j + " - " + resultingTable[j]);
       }



   });


});

req.on('error', function(e) {
 console.log('problem with request: ' + e.message);
});

req.write("");

req.end();




//console.log(document.childNodes[1].tagName); //> 'html'
//console.log(document);
