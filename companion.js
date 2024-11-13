/*
 * start http/https server
 * on update, e.g. adding removing file, broadcast as SSE (as defined at the end)
 * 	https://nodejs.org/docs/latest/api/fs.html#fswatchfilename-options-listener
 * try to send MIME types
 * 	could use https://iwearshorts.com/blog/serving-correct-mimes-with-node-and-express/
 * 	yet theoretically ContentType might be enough https://www.geeksforgeeks.org/difference-between-contenttype-and-mimetype/
 * examples with .txt and .json
 */

/* potential improvements
 

try to get locally generated thumbnails
	execSync( './get_thumbnails' ) // takes less than a second
	  	// but still should NOT be done every single time a file is added, otherwise directory will trigger a LOT of such potentially copying

ramfs to read/write to files yet faster
	https://www.linuxquestions.org/questions/linux-general-1/using-inotify-with-ramfs-672764/

search
	as files get added and potentially converted
		their content
			specifically text at first
				can be extended on png/pdf for OCR
					tesseract filename.jpg out -l eng
					when NOT coming from another format that already provides text
						e.g PDF
		should be indexed to provide search capability too
		can start with a single (JSON) datastructure
			filename, textContent
		
per user scoping
	could prefix most routes with a username (and hash for pseudo privacy)
	sshkeys per user
		allowing to bring content to other devices
			need to be accessible though
				Tailscale?
			trust issue
				fine if self-hosted...

zotero JSON
	biblio management

reMarkable highlights
	full loop, read already, continue your work

area/volumes
	outcome should be ideally space related too
		not send
	could drag&drop duplicate
	drag&drop virtual reMarkable on file instead
		keep the spatial aspect
	could get from reMarkable, e.g latest sketch
		pull from, a la PDF current cloning page
	kanban tagging
		to read
		to share
		...

highlighting back, cf https://x.com/utopiah/status/1847620072090595547

should get
	stamped PDF with JSON of highlights

	stamped PDF
		pdftk augmented_paper.pdf burst
		convert highlight.png highlight.pdf
		pdftk pg_0012.pdf stamp highlight.pdf output test.pdf
		mv test.pdf pg_0012.pdf 
		pdftk pg_00*pdf output stamped.pdf

	JSON of highlight
		see ~/Prototypes/pdf_highlight_from_position/ for a way to go from x,y coordinates to text
			using PDF.js-extract in NodeJS
				this is a very large dependency, ~235MB, due to node-canvas (181MB)
		could do gradual window growth
			start with exact line
				if fail, try N pixel above/below
					if tail try again with 2*N, repeat
		consider https://www.w3.org/TR/annotation-model/ as way to save and share

consider public facing version
	could rely on WebDAV, cf https://webdav.benetou.fr
	with an upload Web interface
	each session would be "private" thanks to a generated keyword, e.g. banana
		by default the user would never have to type it, yet it could be used to restore a past session
	note though that probably quite a few format conversion will break by being truly headless
		need to be tested
		yet quite a few starting with PDFs, thanks to Pandoc alone, should work
	Telegram bot / Slack bot as alternative entry

fs itself, with subdirectory, as manipulable entity
	e.g. using https://github.com/mihneadb/node-directory-tree
		npx directory-tree -p public/  --attributes type,extension,size -o public/filesystem.json

relying on thumbnails already generated locally
	e.g. ~/.cache/thumbnails
	described in https://askubuntu.com/questions/1084640/where-are-the-thumbnails-of-a-new-image-located
	based on MD5 sum of full path

	currently supporting
		pdf blend html png jpg mp4
	not supporting
		glb json txt gz zip
		rare or unofficial
			pmwiki canvas
		custom
			entity component

additional parseable data
	audio or video to text (ideally JSON)
		ffmpeg -i input.mp3 -ar 16000 -ac 1 -c:a pcm_s16le output.wav
		cd ~/Prototypes/whisper.cc && ./main -m /home/fabien/Prototypes/whisper.cpp/models/ggml-base.en.bin -f samples/jfk.wav -ojf ./res
		getting a samples/jfk.wav.json as output 
	PDF to text (for highlights)
		using PDF.js-extract in NodeJS
	PDF images to images
		pdfimages
			no position, only number and page number
			seems that despite -j (supposedly forcing JPEG conversion) leaves some files unchanged
				e.g. .ppm from augmented_paper.pdf
					pdfimages -j -p au.pdf au/image
					which would in turns need convert all .ppm to jpg in that directory
					could be partial .json of the result, thus supporting subdirectory
						au.pdf.images.json
						viewer can check if this file is present, if so use it too
	image to text (OCR)
		tesseract (or more modern alternatives, but require relatively complex setup)

for custom made types consider updating ~/.config/mimeapps.list

extending to supporting materials, not "just" PDF
	https://x.com/utopiah/status/1851581594340925555

export endpoint
	saving layout back
		possibly with, e.g. by URL parameter, layout loader
		itself could be listed as a component so that all present layouts can be swapped per user
	node email, cf Telegram work done in the past
		/home/fabien/fabien/Prototypes/nodemail/index.js
*/

const express = require('express')
const https = require('https')
const fs = require('fs')
const ip = require('ip')
const app = express()
const port = 3000
const {execSync} = require('child_process')
const nodeHtmlToImage = require('node-html-to-image')

const converters = ['convert', 'soffice', 'inkscape', 'blender ', 'pandoc ', 'ffmpeg', '~/Apps/rmc/bin/rmc ' ]
// should check presence and enable/disalbed conversion based on them, if not present provide hints on how to install
	// currently crashes if not present
// consider the distributed fashion i.e. https://git.benetou.fr/utopiah/offline-octopus/src/branch/master/index.js#L84

app.get('/files', (req, res) => {
  res.json( fs.readdirSync('public') )
})

app.get('/', (req, res) => {
  res.send('')
})

/*
SSE minimal client 
	used only for redirections, e.g. redirecting on public/filename.pdf
		no 2D viewer, etc
	could optional we used for live debugging during demo
	consider the equivalent for drag&drop of file and their content
		namely allowing the upload of files
			arguably not needed with e.g. DropBox
				but could be more direct if handled without 3rd party
	removing the need for any installation yet still reacting, a la reMarkable file drop
	could filter by name
		e.g. device or person
			so that updates are only received by a specific kind of devices
		/sseclient/clientname
		could also rely on <input>
	should display visual update, not just CLI
*/

app.get('/sseclient', (req, res) => {
  res.send(sse_html)
})

const sse_html = `
<!DOCTYPE html>
<html lang="en">
<body></body>
<script>
const source = new EventSource('/events');

source.addEventListener('message', message => {
	let data = JSON.parse( message.data )
	console.log(data)
	if (data && data.open) {
		let li = document.createElement('li')
		let a = document.createElement('a')
		a.href = data.open
		a.innerText = data.open
		document.body.appendChild( li )
		li.appendChild( a )
		window.open(data.open, '_blank')
	}
})
</script>
</html>
`

app.get('/remoteredirect/:filename', (req, res) => {
	let filename = req.params.filename
	let data = {}
	data.open = '/'+filename
	sendEventsToAll(data)
	res.json(data.open)
})

app.use(express.static('public'))

const privateKey = fs.readFileSync("privatekey.pem", "utf8");
const certificate = fs.readFileSync("certificate.pem", "utf8");
const credentials = { key: privateKey, cert: certificate };

const webServer = https.createServer(credentials, app);
webServer.listen(port, () => {
  console.log(`open https://${ip.address()}:${port}/index.html on your WebXR device on the same network`)
});

// see HTML conversion example, cf ~/Prototypes/fot_sloan_companion_with_HTML
	// surprisingly does not grow the size much, and even works with WebGL, so maybe relying on Chromium already installed
		// probably does not work so well headlessly
			// failed via container, cf fot_rpi5/Dockerfile
// Error: Unable to launch browser, error message: Failed to launch the browser process! spawn /root/.cache/puppeteer/chrome-headless-shell/linux-128.0.6613.119/chrome-headless-shell-linux64/chrome-headless-shell ENOENT


// from https://git.benetou.fr/utopiah/offline-octopus/src/branch/master/index.js
// SSE from https://www.digitalocean.com/community/tutorials/nodejs-server-sent-events-build-realtime-app
// adapted from jxr-permanence
let clients = [];

function eventsHandler(request, response, next) {
  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
  };
  response.writeHead(200, headers);
  const clientId = Date.now();
  const newClient = { id: clientId, response };
  clients.push(newClient);
  request.on('close', () => { clients = clients.filter(client => client.id !== clientId); });
}

function sendEventsToAll(data) {
  // function used to broadcast
  clients.forEach(client => client.response.write(`data: ${JSON.stringify(data)}\n\n`))
}

let savedLayout

const rmDirectory = 'remarkablepro'

app.get('/send-remarkablepro/:filename', (req, res) => {
	filename = req.params.filename
	if (filename.includes('/')) {
		res.json('error, invalide filename')
	} else {
		// same paradigm i.e. a directory per drmDirectory+'/'+filenameevice, with automated conversion to the supported target format
		let src = 'public'+'/'+filename
		let dest = rmDirectory+'/'+filename
		fs.copyFile(src, dest, (err) => {
		  // if (err) throw err;
		  console.log(src,'was copied to',dest);
		});
		res.json(filename)
	}
})

app.get('/save-layout/:layout', (req, res) => {
	savedLayout = req.params.layout
	// unsafe, assume JSON but could be anything
	try{ JSON.parse(savedLayout) } catch { console.log('not json, file NOT saved!'); res.json('failed saved, not proper JSON!'); return }
	console.log('savedLayout', savedLayout)
	// could be saved to disk, thus to file, too
	let savedFilename = Date.now()+'.layout.json'
	fs.writeFileSync('./public/'+savedFilename, savedLayout)
		// might be better to save in a dedicated directory in ./public
	res.json(savedFilename)
})

app.get('/export-email', (req, res) => {
	if (!savedLayout){
		res.json('layout missing, email NOT sent')
		return
	}
	let content = JSON.stringify(savedLayout)
	let title = "your Spatial Scaffolding companion based layout saved"
	const emailData = {
	    Recipients: [ { Email: "fabien@iterative-explorations.com", Fields: { name: "fabien" } } ],
	    Content: {
		Body: [
		    { ContentType: "HTML", Charset: "utf-8", Content: '\n\n' + content + "\n sent to {name} \n" }
		],
		From: "noreplay@mymatrix.ovh", Subject: "email via node: " + title
	    }
	};
	emailsApi.emailsPost(emailData, callback); //not needed here
	res.json('email sent')
})

app.get('/events', eventsHandler);
// for example /events.html shows when /scan begings (but not ends)

let newFiles = []
fs.watch('public', (eventType, filename) => {
  console.log(`event type is: ${eventType}`); // rename can also be deleting...
	// could consequently check if the file still exists, if not, had been deleted
  if (filename) {
	sendEventsToAll({filename,eventType})
    console.log(`filename provided: ${filename}`)
	 if (eventType == "rename"){
		 if (!fs.existsSync(filename)) {
		    console.log(`${filename} deleted`)
		}
	 }
	 if (eventType == "change"){
	  if (newFiles.includes(filename)){
		 console.log( 'skip, not a new file') 
		} else {
		 console.log('new file', filename, '_________________________________________')
		 if ( !filename.includes('.live') ) {
			 newFiles.push(filename)
		  // bypass on convention, e.g. live in the filename
		  	// alternatively could be a dedicated subdirectory
		  } else { console.log('live file, no future ignoring') }

		// all those should be within a try/catch block as they can fail for many reasons
		  if (filename.endsWith('.pdf')) execSync( 'convert "'+filename+'" "'+filename+'.jpg"', {cwd:'public'})
		  // if (filename.endsWith('.pdf')) execSync( 'convert -density 600 '+filename+' -background white -flatten -resize 25% '+filename+'.jpg', {cwd:'public'})
			// untested, high res
		  if (filename.endsWith('.ods')) execSync( 'soffice --headless --convert-to jpg '+filename, {cwd:'public'})
			// .xls also works
		  if (filename.endsWith('.odg')) execSync( 'soffice --headless --convert-to jpg '+filename, {cwd:'public'})
		  if (filename.endsWith('.odp')) execSync( 'soffice --headless --convert-to pdf '+filename, {cwd:'public'})
			  // automatically "cascade" to PDF conversion
		  if (filename.endsWith('.svg')) execSync( 'inkscape --export-type="png" '+filename, {cwd:'public'})
		  // execSync( 'inkscape --export-type="png" '+filename+'; convert '+filename.replace('svg','png')+' '+filename.replace('svg','png'), {cwd:'public'})
		  // could probe to see if the commands, e.g. convert, inkscape, etc are available
			// if not, return a warning, suggesting to install them
			// (could try using the local package manager)
		  if (filename.endsWith('.blend')) execSync( `blender "${filename}" -b --python-expr "import bpy;bpy.ops.export_scene.gltf( filepath='test.glb', export_format='GLB', use_active_collection =True)"`, {cwd:'public'})
		  if (filename != 'index.html' && filename.endsWith('.html')) {
			  // could potentially be done via Pandoc too
			let data = fs.readFileSync('./public/'+filename, { encoding: 'utf8', flag: 'r' });
			nodeHtmlToImage({ output: './public/'+filename+'.png', html: data }).then(() => console.log('The image was created successfully!'))
		  }
		  if (filename.endsWith('.aframe.component')) console.log('aframe component, to live reload')
		  if (filename.endsWith('.aframe.entity')) console.log('aframe entity, to live reload')
			// nothing to do serve side though, see client side
		  if (filename.endsWith('.epub')) execSync( 'pandoc '+filename+" -o "+filename+".pdf", {cwd:'public'})
			// pandoc allows quite few more formats, e.g. docx, ODT, RTF but also MediaWiki markup, Markdown, etc even reveal.js slides
				// interestingly also for this work, BibTeX and CSL JSON, and other bibliographic formats
					// e.g. pandoc biblio.bib -t csljson -o biblio2.json from https://pandoc.org/demos.html
		  if (filename.endsWith('.rm')) execSync( '~/Apps/rmc/bin/rmc -t svg -o '+filename+'.svg '+filename, {cwd:'public'})
			// see also latestRemarkableNoteToXR
			// automatically "cascade" to SVG conversion
		  if (filename.endsWith('.wav')) execSync( 'ffmpeg -i '+filename+" -y "+filename+".mp3", {cwd:'public'})
		  if (filename.endsWith('.mov')) execSync( 'ffmpeg -i '+filename+" -y "+filename+".mp4", {cwd:'public'})
		  if (filename.endsWith('.pmwiki')) execSync( 'cat '+filename+' | grep -a "^text=" | sed "s/^text=//" | sed "s/%0a/\\n/g" | sed "s/%25/%/g" | sed "s/%3c/</g" | pandoc -f ../pmwiki_reader.lua -o '+filename+".pdf", {cwd:'public'})
			// untested
			// requires pandoc lua filter
			  // automatically "cascade" to PDF conversion
		  // unfortunately PmWiki does not have its own filename so have to do it manually i.e. .pmwiki
			// cf https://github.com/tfager/pandoc-pmwiki-reader/issues/1
			// cat Fabien.Principle.pmwiki | grep -a "^text=" | sed "s/^text=//" | sed "s/"%0a"/\n/g" | sed "s/%25/%/g" | sed "s/%3c/</g" | pandoc -f pmwiki_reader.lua -o Fabien.Principle.pmwiki.pdf
		}
	 }
  } else {
    console.log('filename not provided');
  }
});

/* ========================= reMarkable ========================= */

let newFilesRM = []
fs.watch(rmDirectory, (eventType, filename) => {
  if (filename) {
	 if (eventType == "rename"){ if (!fs.existsSync(filename)) { console.log(`${filename} deleted`) } }
	 if (eventType == "change"){
	  if (newFilesRM.includes(filename)){
		 console.log( 'skip, not a new file') 
		} else {
		 console.log('new file', filename, '_________________________________________')
		 if ( !filename.includes('.live') ) {
			 newFilesRM.push(filename)
		  } else { console.log('live file, no future ignoring') }

		  if (!filename.endsWith('.pdf') && !filename.endsWith('epub')){
			  console.log('this target only supports pdf and epub directory for now')
			  // could instead here try conversion
			  return
		  } else {
			// let sendRmCmd = 'scp "'+filename+'" remarkable2:/home/root/ && ssh remarkable2 -t "source /home/root/.bashrc; addWithMetadataIfNewSpaScaDir '+filename+'; systemctl restart xochitl"'
			let sendRmCmd = 'scp "'+filename+'" remarkablepro:/home/root/ && ssh remarkablepro -t "source /home/root/remarkable_functions.sh; addWithMetadataIfNew '+filename+'; systemctl restart xochitl"'
			  // could improve using krop via cli
				  //  krop --go --trim filename.pdf -o filename-cropped.pdf
			console.log(sendRmCmd) // verification
			// assuming the right ssh key and parameters (usually in ~/.ssh/ for the current user running the companion)
				// does not work on containerized environment (lacking such access)
					// could be considered with offline-octopus proper
			// should be within a try/catch block as they can fail for many reasons
			execSync( sendRmCmd, {cwd:rmDirectory})
		  }
		}
	 }
  } else {
    console.log('filename not provided');
  }
});

/* ========================= rclone ========================= */
const { spawn } = require('node:child_process');
const changenotify = spawn('rclone', ['test', 'changenotify', 'dropbox:']);
// testable via https://www.dropbox.com/request/TVNfsrMpTr1RcsuNisIX
//const changenotify = spawn('rclone', ['test', 'changenotify', 'googledrive:']);
// sadly didn't seem to work, account deleted and rclone config removed remote

changenotify.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

let newFiles_dropbox = []
changenotify.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
	// console.log(data.toString()); return
	// TODO ... for now stick to single file upload, otherwise with the current DropBox messaging it's a mess
	// bit of a mess really... no proper timestamp, multiple messages with same file, no event type...
  // stderr: 2024/10/29 23:06:24 NOTICE: "remote_directory_test/Fabien Benetou - freezer.glb": 1
	if (data.toString().includes('polling every')) return
	// need to sync first THEN push
	let syncOutput = execSync( 'rclone copy dropbox:remote_directory_test dropbox_remote_upload/' ).toString()
	// not usable output
	// console.log('sync output:', syncOutput)

	// probably syncing way too much, syncing on each message isn't necessary!
		// should only sync on genuinely new files

	let lines = data.toString().split('\n')
	lines.map( (l,i) => {
		let newfile = l
			.replace(/.*NOTICE: "/,'')
			.replace(/".*/,'')
			.replace('remote_directory_test','dropbox_remote_upload')
			.replace('\n','')
		// nearly always 2 output 
		if (newfile.length && i > 0) {
			console.log('--------------newfile (line ',i,'): ', newfile)
			// sometimes one lines, sometimes 2...
			if (!newFiles_dropbox.includes(newfile)){
				if (newfile.includes(' - ')){ // DropBox heuristic...
					let matches = newfile.match(/(.*)\/(.*) - (.*)\.(.*)/)
					if (matches.length){
						let [full,path,start,end,ext] = matches
						let flipped = path+'/'+end+' '+start+'.'+ext
						// assuming always with an extension for now, no directory upload with subdirectories
						console.log('>>> might also exist flipped so adding it flipped:', flipped)
						if (newFiles_dropbox.includes(flipped)){
							console.log('>>> flipped already present! Should skip too')
						}
						newFiles_dropbox.push(flipped)

					}
				}
				newFiles_dropbox.push(newfile)
				console.log( 'new file, actually do sth, i.e copy : ', newfile )
				// nearly file... but sometimes still a duplicate file goes through due to username added before OR after (?!)
				// 2024/11/03 02:42:55 NOTICE: "remote_directory_test/Fabien Benetou - remarks_nlnet.txt": 1
				// 2024/11/03 02:42:55 NOTICE: "remote_directory_test/remarks_nlnet Fabien Benetou.txt": 1
				// here on local filesystem we only get 1... but sometimes we get both! (?!)
				// ... so we should check includes without username (regardless of position or hypthen)
					// could ignore if includes but for that need to know what is the filename vs username in a reliable way

				try {
					//fs.copyFile('./'+newfile, './public/'+newfile.split(' ').at(-1), (err) => {
					let src = './'+newfile
					// problematic when done at the same time so switching to kind of uuid
					//let dest =  './public/'+Date.now()+'.'+newfile.split('.').at(-1)
					let pseudouuid = (new Date()).getTime().toString(36) + Math.random().toString(36).slice(2)
					// TODO not a good solution, getting plenty of duplicates
						// hopefully partly pruned now
					// somehow getting 2 files for 1 transfer, not good!
						// good do checksum if needed but a bit time consuming for large files
					// let dest =  './public/dropbox_'+pseudouuid+'.'+newfile.split('.').at(-1)
					let dest =  './public/dropbox_'+newfile.replace('dropbox_remote_upload/','')
					fs.copyFile(src, dest, (err) => {
					  // if (err) throw err;
					  console.log(src,'was copied to',dest);
					});
				} catch (e) {
					console.log('error copy', e)
				}

			} else {
				console.log( 'ignoring, already present' )
			}
		}
				
	})
});

changenotify.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});

/*
	rclone
		rclone copy public/ dropbox:fot_sloan_companion_public
		rclone bisync -n public/ dropbox:fot_sloan_companion_public --resync
		rclone bisync -n public/ dropbox:fot_sloan_companion_public
		watch -n 10 rclone bisync dropbox_remote_upload/ dropbox:remote_directory_test --resync
			probably better not to use --resync for faster/lighter results
				might not even want bisync here as it's always getting new content, copy is probably better
					rclone copy dropbox:remote_directory_test dropbox_remote_upload/
			could consider leaving that in the background running
				child_process.spawn with detached option
					https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
		changenotify https://rclone.org/commands/rclone_test_changenotify/
			rclone test changenotify dropbox:
				says polling every 10s but seems much faster
*/

/* ========================= elasticemail ========================= */
var ElasticEmail = require('@elasticemail/elasticemail-client');
var defaultClient = ElasticEmail.ApiClient.instance;
var apikey = defaultClient.authentications['apikey'];
apikey.apiKey = "0C3D85070303586EB6A3C74E770942F903ACA0C46AFEEDB86CA334A8937056CFFDE92AE7D109FF5AAC41AB2B3CCFF1EB"
const emailsApi = new ElasticEmail.EmailsApi();

const callback = (error, data, response) => {
    if (error) {
        console.error(error);
    } else {
        console.log('API called successfully. Email sent.');
    }
};
