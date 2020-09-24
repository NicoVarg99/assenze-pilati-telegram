const https = require('https');
const fs = require("fs");
const TelegramBot = require('node-telegram-bot-api');
const timediff = require('timediff');
var requestedSubstitute = "-";
const token = process.env.TOKEN;
var fetchTimes = 0;
var assenze; //Data or null
var errorMessage = "Errore nella richiesta al sito scolastico.\nProva a visitarlo manualmente: https://www.istitutopilati.it/gestione_sostituzioni/slideshow_fermo.php";
const savesFileName = "./users-data.json";

if (!token) {
  console.log("ERROR: token is not defined");
  process.exit(255);
}

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});
bot.on("polling_error", console.log);

var connectionOptions = {
  hostname: 'www.istitutopilati.it',
  port: '443',
  path: '/gestione_sostituzioni/sostituzioni/listaPubblica.json',
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
  strictSSL: true
};

String.prototype.toTitleCase = function () {
  return this.replace(/\w\S*/g, txt => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

function writeJSON(dict) {
  // Write data in the file
  const data = JSON.stringify(dict, null, 4);  
  fs.writeFileSync(savesFileName, data);
}

function loadJSON() {
  // Read the data written in the file
  var data = fs.readFileSync(savesFileName, {encoding: "utf-8", flag: "r"});
  data = JSON.parse(data.toString());
  return data;
}

function msgAssenze(msg, match) {
  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the message
  var requestedClass = match[1].toUpperCase();
  var resultingTable = [];

  if (!assenze) { //If no data is there, send an error message
    bot.sendMessage(msg.chat.id, errorMessage);
    return;
  }

  for (var i in assenze.sostituzioni) //For each row
    if (assenze.sostituzioni[i].classe.toUpperCase() == requestedClass) //If curent class = requested class
      resultingTable.push(assenze.sostituzioni[i]);

  var numResults = 0;
  response = "Per " + assenze.data + " nella classe " + requestedClass + " sono previste le seguenti assenze:\n";

  for (var i = 0; i < resultingTable.length; i++) { //For each match
    response += "\nAssente: " + resultingTable[i].docenteAssente + "\n";
    response += "Sostituto: " + resultingTable[i].docenteSostituto + "\n";
    response += "Orario: " + resultingTable[i].orario + "\n";
    if (resultingTable[i].note != "")
      response += "Note: " + resultingTable[i].note + "\n";
    numResults++;
  }

  if (numResults == 0)
    response = "Nessuna assenza prevista per " + assenze.data + " nella classe " + requestedClass + ".";

  bot.sendMessage(msg.chat.id, response);
}

function msgSostituto(msg, match) {
  //Searchs by substitute
  var requestedSubstitute = match[1].toUpperCase();
  var resultingTable = [];

  if (!assenze) { //If no data is there, send an error message
    bot.sendMessage(msg.chat.id, errorMessage);
    return;
  }

  for (var i in assenze.sostituzioni) //For each row
    if (assenze.sostituzioni[i].docenteSostituto.toUpperCase().includes(requestedSubstitute)) //If curent class = requested class
      resultingTable.push(assenze.sostituzioni[i]);

  var numResults = 0;
  response = "Per " + assenze.data + " al docente " + resultingTable[0].docenteSostituto + " sono assegnate le seguenti sostituzioni:\n";

  for (var i = 0; i < resultingTable.length; i++) { //For each match
    response += "\nAssente: " + resultingTable[i].docenteAssente + "\n";
    response += "Orario: " + resultingTable[i].orario + "\n";
    response += "Classe: " + resultingTable[i].classe + "\n";
    if (resultingTable[i].note != "")
      response += "Note: " + resultingTable[i].note + "\n";
    numResults++;
  }

  if (numResults == 0)
     response = "Nessuna assenza assegnata per " + assenze.data + " al docente " + requestedSubstitute + ".";

  bot.sendMessage(msg.chat.id, response);
}

bot.onText(/^\/assenze$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Specifica una classe!\nEsempio: /assenze CLASSE");
});

bot.onText(/\/assenze.* (.+)/, msgAssenze);

bot.onText(/\/sostituto.* (.+)/, msgSostituto);

bot.onText(/^\/aggiornami$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Specifica la classe!");
});

bot.onText(/^\/sostituto$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Specifica il nome!");
});

bot.onText(/\/aggiornami.* (.+)/, setUpdatesForNewUser);

bot.onText(/\/start.*/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Bot avviato. Invia un messaggio come /assenze classe.\n Per essere aggiornato su ogni nuova sostituzione invia /aggiornami classe");
});
bot.onText(/^\/help$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "Comandi disponibili:\n\n/assenze classe\n/sostituto nome\n/aggiornami classe");
});
bot.onText(/^ping$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, "pong");
});

bot.onText(/.*/, (msg, match) => {
  var date = new Date().toISOString().
  replace(/T/, ' ').      // replace T with a space
  replace(/\..+/, '');

  var string = date + " - " + msg.from.id + " " + msg.from.first_name + " " + msg.from.last_name  + " " + msg.from.username + " on chat "  +  msg.chat.id + " - " + match;
  console.log(string);
  //bot.sendMessage(msg.chat.id, "Comandi disponibili:\n\n/assenze classe\n/sostituto nome");

  fs.appendFile('requests.log', string + '\n', function (err) {
  if (err) throw err;
  //console.log('Saved!');
  });

});

function fetchData() {
  //Fetches new data - To be called at regular intervals or after requests
  var req = https.request(connectionOptions, function(res) {
    var totalData = "";

    res.on('data', function (data) {
      totalData += data;
    });

    res.on('end', function () {
      try {
        totalData = JSON.parse(totalData);
      } catch (e) {
        totalData = null;
        console.log(e instanceof SyntaxError); // true
        console.log(e.message);                // "missing ; before statement"
        console.log(e.name);                   // "SyntaxError"
        console.log(e.fileName);               // "Scratchpad/1"
        console.log(e.lineNumber);             // 1
        console.log(e.columnNumber);           // 4
        console.log(e.stack);                  // "@Scratchpad/1:2:3\n"
      } 

      // When the site updates it sends news to users
      if(fetchTimes && assenze.timestamp != totalData.timestamp)
        sendUpdates();  

      assenze = totalData;
      fetchTimes++;
    });
  });

  req.on('error', function(e) {
    console.log('Problem with request: ' + e.message);
    assenze = null;
  });

  req.write("");
  req.end();
}

function getUsersFromSavesFile() {
  // Returns the subscribers list
  if (!fs.existsSync(savesFileName)) {
    fs.closeSync(fs.openSync(savesFileName, 'w'));
    return [];
  }
  else {
    var rawData = fs.readFileSync(savesFileName);

    if (rawData == '')
      return [];
    else
      return loadJSON();
  }
}

function setUpdatesForNewUser(msg, match) {
  // Subscribe a new user

  var usersData = getUsersFromSavesFile();

  const newUser = {
    id: msg.chat.id,
    username: msg.chat.username,
    first_name: msg.chat.first_name,
    school_class: match[1].toUpperCase(),
    date: null,
    sended: null
  }

  var found = undefined;

  for(var user = 0; user < usersData.length; user++) {
    console.log(newUser.id + " " + usersData[user].id);
    if (newUser.id == usersData[user].id)
      found = user;
  }

  if (found == undefined) {
      usersData.push(newUser);
      bot.sendMessage(newUser.id, "Ottimo, verrai aggiornato sulle sostituzioni della classe "
                      + newUser.school_class + ".\nPer cambiare la classe digita /aggiornami nuova_classe");
  }
  else {
    usersData[found] = newUser;
    bot.sendMessage(newUser.id, "Va bene, da ora verrai aggiornato sulla classe " + newUser.school_class);
  }

  console.log(usersData);

  writeJSON(usersData);
}

function sendUpdates() {
  // For each person subscribed sends the news related to their class

  const usersData = getUsersFromSavesFile();

  for(var user in usersData) {
    var resultingTable = [];

    for (var i in assenze.sostituzioni) //For each row
      if (assenze.sostituzioni[i].classe.toUpperCase() == usersData[user].school_class) //If curent class = requested class
        resultingTable.push(assenze.sostituzioni[i]);

    if (usersData[user].sended != resultingTable || usersData[user].date != assenze.data) {
      var numResults = 0;
      response = "Hey " + usersData[user].first_name + ". Per " + assenze.data + " nella classe " + usersData[user].school_class + " sono previste le seguenti assenze:\n";

      for (var i = 0; i < resultingTable.length; i++) { //For each match
        response += "\nAssente: " + resultingTable[i].docenteAssente + "\n";
        response += "Sostituto: " + resultingTable[i].docenteSostituto + "\n";
        response += "Orario: " + resultingTable[i].orario + "\n";
        if (resultingTable[i].note != "")
          response += "Note: " + resultingTable[i].note + "\n";
        numResults++;
      }

      if (numResults == 0)
        response = "Hey " + usersData[user].first_name + ". Nessuna assenza prevista per " + assenze.data + " nella classe " + usersData[user].school_class + ".";

      bot.sendMessage(usersData[user].id, response);
    }

    usersData[user].sended = resultingTable;
    usersData[user].date = assenze.data;
    writeJSON(usersData);
  }
}

fetchData(); //Fetch data immediately
setInterval(fetchData, 5*60*1000); //Fetch data every 5 minutes
