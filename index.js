/* nodejs server to grab the current URL as tridactyl command and serve back page with content */

// mkdir tabs polydata

// autocmd TabEnter  .* js fetch("http://localhost:7777/?url="+window.location.href)
// might be interesting to keep track of document.referrer too
// consider instead Firefox Account

const fs = require('fs');
const express = require('express')
const cors = require('cors')
const https = require('https')
const path = require('path')
const {execSync} = require('child_process');
const fetch = require('node-fetch');

const app = express()
app.use(cors())

app.get('/getpoly', function(req, res){
	const polypath = "polydata"
	const url = "https://static.poly.pizza/"
	const extensions = [".glb",".webp"]
	const filepath = path.join(__dirname, polypath, req.query.id+extensions[0])
	if (!fs.existsSync(filepath)){
		execSync("wget "+url+req.query.id+extensions[0], {cwd:path.join(__dirname,polypath)})
		execSync("wget "+url+req.query.id+extensions[1], {cwd:path.join(__dirname,polypath)})
	}
	res.send("received");
});

app.get('/voiceinput', function(req, res){
	console.log(req.query.keyword)
	sseSend(req.query.keyword)
	res.send("received");
});

app.get('/search', async function(req, res){
	const response = await fetch('https://api.poly.pizza/v1/search/'+req.query.keyword, {
		headers: {'x-auth-token': 'e821ece91d1a43c1ac70299368a72b8a'}
	});
	const data = await response.json();

	res.json(data);
});

app.get('/cabin', function(req, res){
	res.sendFile(path.join(__dirname, 'cabin.html'))
});

app.get('/', function(req, res){
	res.sendFile(path.join(__dirname, 'index.html'))
});

app.get('/tabs', function(req, res){
	res.json({"files":fs.readdirSync("tabs")})
});

// resulting in possibly getting /static/screens/1652811988.png
app.get('/screens', function(req, res){
	res.json({"files":fs.readdirSync("screens")})
});

const container = "docker run --rm -e UID=$(id -u) -e GID=$(id -g) "
// could try losing priviledges instead, if possible
fs.watch("cabin.html", (eventType, filename) => {
	if (eventType == "change") sseSend(filename+" modified")
})


// SSE to force reload client-side
var connectedClients = []
function sseSend(data){
        connectedClients.map( res => {
                console.log("notifying client") // seems to be call very often (might try to send to closed clients?)
                res.write(`data: ${JSON.stringify({status: data})}\n\n`);
        })
}

app.get('/streaming', (req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'text/event-stream');
        //res.setHeader('Access-Control-Allow-Origin', '*');
        // alread handled at the nginx level
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders(); // flush the headers to establish SSE with client

        res.write(`data: ${JSON.stringify({event: "userconnect"})}\n\n`); // res.write() instead of res.send()
        connectedClients.push(res)

        // If client closes connection, stop sending events
        res.on('close', () => {
                console.log('client dropped me');
                res.end();
        });
});

// consider instead CloudInit so that it can be delegated to another machine
	// keeping a pool of available machine would start with a single one
	// namely that it is possible to run multiple containers on 1 instance, simultaneously or not.
containersSupportedByLanguage = {
	bash: "debian ", 
	julia: "julia julia -E ",
	python: "python python -c ",
	// avoided file specific languages
		// could be done by writing to a file in the container e.g /tmp/file.c then passing it as parameter
}


app.get('/invitereload', function(req, res){
	sseSend("reload")
	res.json({"res":"reload requested"})
})

app.get('/command', function(req, res){
	var req = req.query.command
	var foundContainer = containersSupportedByLanguage[req.split(" ")[0]]
	var code = req.split(" ").slice(1).join(" ")
	if (foundContainer)
		res.json({"res":execSync(container+foundContainer+code).toString()})
	else
		res.json({"res":"language not supported"})
});
// could specify name, it then contiue instance

// ~/.openai-codex-test-xr
// potential alt backend to generate

app.get('/currenturl', function(req, res){
	// could instead be the webxr page
	let now = + new Date()
	fs.appendFile('currentURL.txt', now+" "+req.query.url+" "+req.query.referrer+"\n", function (err) { if (err) throw err; });
	// could be JSON instead
	res.json({"status":"test"})
});

app.use('/static', express.static(path.join(__dirname, '.')))
// including currentURL.txt

const port = 7777
app.listen(port, () =>
  console.log('listening on port', port)
);
