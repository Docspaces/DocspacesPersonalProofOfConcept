const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const cors = require('cors');
const ejs = require('ejs');
const bodyParser = require('body-parser');
const { application } = require('express');

const db = new sqlite3.Database('./test.db');

db.run('CREATE TABLE IF NOT EXISTS diagrams (id integer primary key autoincrement, name text not null, data text not null, type varchar(50) not null)');
//db.run('DROP TABLE IF EXISTS pages');

db.run('CREATE TABLE IF NOT EXISTS pages (id integer primary key autoincrement, path text not null unique, data text not null)');

// Markdown rendering library
const marked = require('marked')

// Libraries to sanitise HTML
const createDOMPurify = require('dompurify')
const { JSDOM } = require('jsdom')
const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window)


const app = express();

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
//app.use(cors);

app.get('/diagrams/:id/edit', (req, res) => {

  var data = {}
  var options = {}

  db.all("SELECT id, name, data, type FROM diagrams WHERE id = ?", [req.params.id], function (err, rows) {

    if (err) {
      console.error(err.message);
      return
    }

    data.diagram = rows[0];

    var template = data.diagram.type == 'drawio' ? './templates/edit_drawio.ejs' : './templates/edit_mermaid.ejs';

    ejs.renderFile(template, data, options, function (err, str) {

      if (err) {
        res.status(500);
        res.send(err.message);
      }
      else {
        res.status(200);
        res.send(str);
      }
    });
  });

});


app.get('/diagrams/:id/fetch', (req, res) => {

  var data = {}
  var options = {}

  db.all("SELECT id, name, data, type FROM diagrams WHERE id = ?", [req.params.id], function (err, rows) {

    if (err) {
      res.status(500);
      res.send(err.message);
    }
    else {
      console.log[rows[0]];
      res.status(200);
      res.send(rows[0]);
    }

  });

});

app.post('/diagrams/new', (req, res) => {

  //console.log(req);
  console.log(req.body.name);
  console.log(req.body.diagramType);

  if (req.params.name == '') {
    res.status(500);
    res.send('Missing name');
  } else {

    var defaultData = '';

    if (req.body.diagramType == 'mermaid') {
      defaultData = `sequenceDiagram`
    }

    db.get("INSERT INTO diagrams (name, type, data) VALUES (?, ?, ?) RETURNING id", [req.body.name, req.body.diagramType, defaultData], function (err, row) {

      if (err) {
        res.status(500);
        res.send(err.message);
      }
      else {
        res.status(200);
        res.send({ id: row.id });
      }

    });
  }

});

app.post('/diagrams/:id/update', (req, res) => {

  if (req.params.id == '') {
    res.status(500);
    res.send('Missing id');
  } else {

    db.get("UPDATE diagrams SET data = ? WHERE id = ?", [req.body.data, req.params.id], function (err, row) {

      if (err) {
        res.status(500);
        res.send(err.message);
      }
      else {
        res.status(200);
        res.send({ status: "OK" });
      }

    });
  }

});

app.post('/diagrams/:id/rename', (req, res) => {

  if (req.params.id == '') {
    res.status(500);
    res.send('Missing id');
  } else {

    db.get("UPDATE diagrams SET name = ? WHERE id = ?", [req.body.name, req.params.id], function (err, row) {

      if (err) {
        res.status(500);
        res.send(err.message);
      }
      else {
        res.status(200);
        res.send({ status: "OK" });
      }

    });
  }

});

app.get('/diagrams', (req, res) => {

  var data = {}
  var options = {}

  db.all("SELECT id, name, type FROM diagrams ORDER BY name", function (err, rows) {

    if (err) {
      console.error(err.message);
      return
    }

    data.diagrams = rows

    ejs.renderFile('./templates/index.ejs', data, options, function (err, str) {
      if (err) {
        res.status(500);
        res.send(err.message);
      }
      else {
        res.status(200);
        res.send(str);
      }
    });
  });

});

app.get(/^\/[a-zA-Z0-9\/]+$/, (req, res) => {
  console.log('GET ' + req._parsedUrl.pathname)

  // if you want to use markdown you can do this:
  // let processed = marked.parse(mdContent) // <<-- produces an HTML string
 
  // Try and read a note from our db with note_path = the url in the request
  db.get("SELECT * FROM pages WHERE path = ?", [req._parsedUrl.pathname], function(err, row) {
    if (err) {
      console.error(err.message);
      return
    }

    var pageData = '';


    if (row) {
      console.log('Loaded page ' + row.id + ": " + row.data)
      pageData = row.data;
    }

    if (req.query['edit'] != undefined) {        
      renderEditorWithContent(pageData, res)
    }
    else {
      var data = {}
      var options = {}

      let processed = marked.parse(pageData); // <<-- produces an HTML string

      data.output = DOMPurify.sanitize(processed);

      ejs.renderFile('./templates/page_render.ejs', data, options, function(err, str) {
        res.send(str)
      });
    }

  })
});

  function renderEditorWithContent(content, res) {
    var data = {}
    var options = {}
  
    data.output = DOMPurify.sanitize(content)
  
    ejs.renderFile('./templates/page_editor.ejs', data, options, function(err, str) {
      res.send(str)
    });
  }


  // This processes the same URLs as the .get method, but this is for post-back only, so when the user is trying to update
app.post('/*', (req, res) => {
  console.log('POST ' + req._parsedUrl.pathname)
  console.log(req.body);

  // This is a funny Sqlite specific way to update-or-insert in a single statement, just for simplicity
  db.run("INSERT INTO pages (path, data) \
            VALUES(?, ?) \
            ON CONFLICT(path) DO UPDATE SET \
              data = ?", [req._parsedUrl.pathname, req.body.content, req.body.content]);

  // Re-render the editor with the same content we just saved
  renderEditorWithContent(req.body.content, res)
});

app.use('/', express.static(__dirname + '/static'));
app.listen(3000, () => console.log('App Started'));
