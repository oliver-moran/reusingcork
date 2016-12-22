var Express = require("express");
var Datastore = require("nedb");
var BodyParser = require("body-parser");
var Multer = require("multer");
var UUID = require("uuid");
var Jimp = require("jimp");
var FS = require("fs");
var Path = path = require("path");
var DataUriToBuffer = require("data-uri-to-buffer");

var data_dir = process.env.OPENSHIFT_DATA_DIR || "./";
var static_dir = Path.join(data_dir, "static");
var db_dir = Path.join(data_dir, "db");

if (!FS.existsSync(static_dir)) FS.mkdirSync(static_dir);
if (!FS.existsSync(db_dir)) FS.mkdirSync(db_dir);

var db = {
    locations: new Datastore({ filename: Path.join(db_dir, "locations.json"), autoload: true }),
    revisions: new Datastore({ filename: Path.join(db_dir, "revisions.json"), autoload: true })
}

var app = Express();
var upload = Multer(); // for parsing multipart/form-data
app.use(BodyParser.json({limit: "10mb"})); // for parsing application/json
app.use(BodyParser.urlencoded({limit: "10mb", extended: true })); // for parsing application/x-www-form-urlencoded

app.use(Express.static("public"));
app.use("/static", Express.static(static_dir))

app.get("/api/hello/:world", function(req, res){
  res.send("Hello, " + + req.params.world);
});

app.get("/api/locations", function(req, res) {
    db.locations.find({}, function (err, docs) {
        if (err) res.status(500);
        else {
            docs.forEach(function(doc) { delete doc._id; })
            res.json(docs);
        }
    });
})

app.get("/api/revisions", function(req, res) {
    db.revisions.find({}, function (err, docs) {
        if (err) res.status(500);
        else {
            docs.forEach(function(doc) { delete doc._id; })
            res.json(docs);
        }
    });
})

app.post("/api/location", function(req, res) {
    var doc = req.body;
    doc.uuid = UUID.v1();
    doc.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    doc.timestamp = Date.now();
    saveImage(doc.img, function(path) {
        doc.img = path;
        db.locations.insert(doc, function (err, newDoc) {
            if (err) res.status(500);
            else {
                res.json(doc);
                saveRevision(doc);
            }
        });
    });
});

app.put("/api/location", function(req, res) {
    var doc = req.body;
    doc.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    doc.timestamp = Date.now();
    saveImage(doc.img, function(path) {
        doc.img = path;
        db.locations.update({uuid: doc.uuid}, doc, {upsert: true}, function (err) {
            if (err) res.status(500);
            else db.locations.find({_id: doc._id}, function (err, docs) {
                if (err) res.status(500);
                else {
                    res.json(doc);
                    saveRevision(doc);
                }
            });
        });
    });
});

function saveImage(img, cb) {
    if (img.indexOf("data:") == 0) {
        decoded = DataUriToBuffer(img);
        Jimp.read(decoded).then(function(image) {
            if (image.bitmap.width > 300) {
                image.resize(300, Jimp.AUTO);
            }
            var file = UUID.v1() + ".jpg";
            var path = Path.join(static_dir, file);
            image.quality(60).write(path, function(err){
                cb("/static/" + file);
            });
        }).catch(function(err){
            console.error(err);
        })
    } else {
        cb(img); // assume already a path
    }
}
    
app.delete("/api/location", function(req, res) {
    var doc = req.body;
    db.locations.remove({uuid: doc.uuid}, {}, function (err) {
        if (err) res.status(500);
        else {
            var data = {
                uuid: doc.uuid,
                ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                timestamp: Date.now()
            };
            res.json(data);
            saveRevision(data);
        }
    });
})

function saveRevision(doc) {
    db.revisions.insert(doc, function (err, newDoc) {
        if (err) console.error(err);
    });    
}

var ipaddress = process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1";
var port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
app.listen(port, ipaddress, function() {
    console.log("Listening at http(s)://" + ipaddress + ":" + port);
});