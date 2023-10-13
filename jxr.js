/*
// just text
import {Runtime, Inspector} from "https://cdn.jsdelivr.net/npm/@observablehq/runtime@4/dist/runtime.js";
import define from "https://api.observablehq.com/@utopiah/from-pim-to-2d-to-3d-to-xr-explorations@2010.js?v=3";
import define2 from "https://api.observablehq.com/d/f219f0c440c6d5a2.js?v=3";
new Runtime().module(define, name => {
  if (name === "numberOfPages") return new Inspector(document.querySelector("#observablehq-numberOfPages-835aa7e9"));
  document.querySelector(".a-enter-vr").style.position = "fixed"
});

// HTML with interactable input
new Runtime().module(define2, name => {
  if (name === "viewof offsetExample") return new Inspector(document.querySelector("#observablehq-viewof-offsetExample-ab4c1560"));
  if (name === "result_as_html") return new Inspector(document.querySelector("#observablehq-result_as_html-ab4c1560"));
  return ["result_no_name","result"].includes(name);
});
// setTimeout( _ => document.querySelector("#gui3d").setAttribute("html", "html:#observablehq-key;cursor:#cursor;" ) , 2000)
  // <a-entity id="gui3d" class="observableui" position="0 1.5 -.4"></a-entity>
*/

/*

motion to data
	- integer, e.g distance from beginning to end
	- curve, sampling N points between beginning and end

being able to use that in jxr commands, with example related to positioning entities
	see https://git.benetou.fr/utopiah/text-code-xr-engine/issues/52#issuecomment-229
	
warning that selectedElement will get overwritten once executing a command by pinching
	consequently in addition to have a history of executed commands
		there should be a history of selected elements
			and maybe their changed position states
*/

// motivated by https://git.benetou.fr/utopiah/text-code-xr-engine/issues/63
var reservedKeywords = ["selectedElement", "lastPointSketch ", "commandhistory", "groupSelection", "targets", "observe", "sa", "qs"]
// see generated file reserved-keywords for more yet not sufficient, see instead parseJXR()
// should also include some documentation

const jxrrootURL = 'https://fabien.benetou.fr/pub/home/future_of_text_demo/'
const prefix = /^jxr /
const codeFontColor = "lightgrey"
const fontColor= "white"
const wikiAsImages = "https://vatelier.benetou.fr/MyDemo/newtooling/wiki_graph.json"
const maxItems = 10
const now = Math.round( +new Date()/1000 ) //ms in JS, seconds in UNIX epoch
const baseCachedURL = "https://vatelier.benetou.fr/MyDemo/newtooling/textures/fabien.benetou.fr_" 
const baseLiveURL = "https://vatelier.benetou.fr/MyDemo/newtooling/web/renders/fabien.benetou.fr_"
const queryFormatBaseURL = "https://fabien.benetou.fr/"
const imageExtension = ".png"
const renderSuffix = "?action=serverrender"
var selectedElement = null;
var targets = []
const zeroVector3 = new THREE.Vector3()
var bbox = new THREE.Box3()
bbox.min.copy( zeroVector3 )
bbox.max.copy( zeroVector3 )
var selectionBox = new THREE.BoxHelper( bbox.object3D, 0x0000ff);
var groupHelpers = []
var primaryPinchStarted = false
var visible = true
var setupMode = false
var setupBBox = {}
var wristShortcut = "jxr switchToWireframe()"
var selectionPinchMode = false
var groupingMode = false
var sketchEl
var lastPointSketch
var hudTextEl // should instead rely on the #typinghud selector in most cases
const startingText = "[]"
var drawingMode = false
var added = []
const maxItemsFromSources = 20
let alphabet = ['abcdefghijklmnopqrstuvwxyz', '0123456789', '<>'];
var commandhistory = []
const savedProperties = [ "src", "position", "rotation", "scale", "value", ] // add newer properties e.g visibility and generator as class
var groupSelection = []
var cabin //storage for load/save. Should use a better name as this is a reminder of a past version rather than something semantically useful.
const url = "https://fabien.benetou.fr/PIMVRdata/CabinData?action="
var primarySide = 0
const sides = ["right", "left"]
var generators = "line-link-entities link screenstack dynamic-view selectionboxonpinches keyboard "
	+ "commands-from-external-json glossary timeline issues web-url background-via-url observableui hidableenvironmentfot fot"
// could be an array proper completed on each relevant component registration
var heightAdjustableClasses = ["commands-from-external-json"]
var pinches = [] // position, timestamp, primary vs secondary
var dl2p = null // from distanceLastTwoPinches
var selectedElements = [];

let editors = []
var editorBaseWidth = 50

// could add a dedicated MakeyMakey mode with a fixed camera, e.g bird eye view, and an action based on some physical input that others, thanks to NAF, could see or even use.
	// ?inputmode=makeymakey

AFRAME.registerComponent('enable-components-via-url', { 
  init: function () {
	var src = AFRAME.utils.getUrlParameter('enable-components-via-url')
	if (src && src != "") {
		src.split(",").map( c => {
			this.el.setAttribute(c, "")
		})
	}
  }
})

AFRAME.registerComponent('disable-components-via-url', { 
  init: function () {
	var src = AFRAME.utils.getUrlParameter('disable-components-via-url')
	if (src && src != "") {
		src.split(",").map( c => {
			Array.from( document.querySelectorAll("["+c+"]") ).map( e => { e.removeAttribute(c) })
		})
	}
  }
})

// e.g background https://fabien.benetou.fr/pub/home/metaverse.png might have to allow options like scale to allow for modifying both size and ratio
AFRAME.registerComponent('background-via-url', { // non interactive mode
  init: function () {
	let generatorName = this.attrName
	var src = AFRAME.utils.getUrlParameter('background')
	if (src && src != "") {
		this.el.setAttribute( "visible", "true")
		this.el.setAttribute( "src", src )
		this.el.className += generatorName
		Array.from( document.querySelectorAll(".mural-instructions") ).map( i => {
			i.setAttribute("visible", "true") 
			i.className += generatorName
		})
	}
  }
})

AFRAME.registerComponent('web-url', {
// e.g <a-entity id=inbrowser web-url position="0 1.5 -2.4"></a-entity>
// motivated by https://glitch.com/edit/#!/aframe-lil-gui?path=observablewidget.html
  init: function () {
	const url = "https://fabien.benetou.fr/Fabien/Principle?action=webvr"
	var target = url
	var src = AFRAME.utils.getUrlParameter('url')
	// could also be a component parameter
	var el = this.el
	let generatorName = this.attrName
	if (src && src != "") target = src
	fetch(target).then( res => res.text() ).then( r => {
	  pageEl = document.createElement("div")
	  pageEl.id = "page"
	  pageEl.innerHTML = r
	  pageEl.style = "visibility:hidden;"
	  document.body.appendChild(pageEl)
	  el.setAttribute("html", "html:#page;cursor:#cursor;" )
	  el.className += generatorName
	  //backdrop
	  const geometry = new THREE.PlaneGeometry( el.object3D.children[0].geometry.parameters.width*1.1,
		el.object3D.children[0].geometry.parameters.height*1.1 );
	  const material = new THREE.MeshBasicMaterial( {color: 0xffffff, side: THREE.DoubleSide} );
	  const plane = new THREE.Mesh( geometry, material );
	  plane.position.z = -.1
	  el.object3D.add( plane );
	})
  }
})

function sendGlbFromEl(el){
	const gltfExporter = new THREE.GLTFExporter();
	const mesh = el.object3D

	const options = {
	    trs: true,
	    onlyVisible: true,
	    truncateDrawRange: false,
	    binary: true,
	    maxTextureSize: Infinity
	};

	gltfExporter.parse(
	    mesh,
	    function (result) {
		if (immersClient) immersClient.sendModel("testing", new Blob([result]), "public")
		console.log("sent blob")
		// worked as https://immers.benetou.fr/s/639cb4171757b8382c120da1 of type model
			// with glb as URL https://immers.benetou.fr/media/edf5641922e6371abb3118f56cd20b9b
	    },
	    function (error) {
		console.log('An error happened during parsing', error);
	    },
	    options
	);
}

var immersClient
// See dedicated issue https://git.benetou.fr/utopiah/text-code-xr-engine/issues/47 
if (false) // disabled for offline tests
document.querySelector("#immersbundle").addEventListener('load',(event) => { 
	immersClient = document.querySelector("immers-hud").immersClient
	document.querySelector('immers-hud').immersClient.sendModel = async function sendModel (name, glb, privacy, icon, to = []) {
		return this.activities.model(name, glb, icon, to, privacy)
	} // shim until API update
	document.querySelector("immers-hud").setAttribute("access-role", "modFull")
	document.querySelector("immers-hud").immersClient.addEventListener("immers-client-connected", _ => {
		//immersClient.addEventListener("immers-client-new-message", e => addNewNote(e.detail.message.messageHTML) ) 
		immersClient.addEventListener("immers-client-new-message", async e => {
			if (e.detail.message.type == "chat"){
				let msg = ( await immersClient.activities.getObject( e.detail.message.id ))
				if (msg.object.context.location )
					addNewNote( e.detail.message.messageHTML, msg.object.context.location.position ,
								"0.1 0.1 0.1", null, "immerschat", "true", msg.object.context.location.rotation )
				else 
					addNewNote( e.detail.message.messageHTML )
				// could hook on pinchended
				// immersClient.place.location = { position: "0 1.5 -2", rotation: "0 190 0" };
				// immersClient.sendChatMessage(textvalue, "public"); 
			}
			if (e.detail.message.type == "media" && e.detail.message.mediaType == "image"){
				console.log("src", e.detail.message.url)
				let el = document.createElement("a-box")
				el.setAttribute("position", -Math.random()+" "+Math.random()*3 + " -1")
				el.setAttribute("width", ".1")
				el.setAttribute("height", ".15")
				el.setAttribute("depth", ".01")
				el.setAttribute("src", e.detail.message.url.href)
				AFRAME.scenes[0].appendChild(el)
			}
			if (e.detail.message.type == "other"){
				let msg = ( await immersClient.activities.getObject( e.detail.message.id ))
				console.log("maybe model, see object.type.model==model", msg )
			}
		})
		immersClient.friendsList().then( r => {
			if (r.length>0) addNewNote( "Friends:", "-1 1.65 -0.5") 
			r.map( (u,i) => { 
				let friendData = u.profile.displayName
				if (u.locationName) friendData += " at " + u.locationName
				if (u.locationURL) friendData += " (" + u.locationURL + " )"
				// addNewNote( friendData, "-1 " + (1.6-i/20) + " -0.5") // should make this interpretable to join there
				// hidden for workshop
			} )
		} ) 
	})
});

function ims(msg){ 
	if (!immersClient) { setFeedbackHUD("not connected via Immers"); return; }
	immersClient.sendChatMessage(msg, "public")
} // shorthand for jxr command, still requires parenthesis and quotes though, could be better to have a dedicated visual shorthand, e.g >>
// can send code too e.g immersClient.sendChatMessage("jxr loadPageRange(3,4)", "public")

/* not sure what's the right way... but timeout works, others don't.

        immers-client-friends-update or immers-client-new-message to keep track of conversations between recurring meeting? Say you join a room, spend a working session with colleagues then leave. Could these be used to in this context to send reminders to those who subscribed to that event?
*/

var polys
async function getPolyList(keyword){
	//return await fetch('/search?keyword='+keyword).then( res => res.json() ).then( res => return res )
	var response = await fetch('/search?keyword='+keyword);
	var polys = await response.json()
	return polys
}

// for testing purposes, disable when not local with asset caching server
//getPolyList("pizza").then( p => polys = p.results )

function cachePoly(res){
	var n = 0;
	res.map( i => { fetch(i.Thumbnail.replace("https://static.poly.pizza/","http://localhost:7777/getpoly?id=").replace(".webp","")) } ) ;
	// see await Promise.all()
}
// should properly wait. Only once all queries are done then try to load.

function loadPolyThumbnails(res){
	var n = 0;
	res.map( i => {
		var el = document.createElement("a-image");
		el.setAttribute("src", i.Thumbnail.replace("https://static.poly.pizza/","http://localhost:7777polydata/"));
		el.setAttribute("position", "0 1 "+n--/10);
			// could instead attach e.g 9 items to the wrist using wristattachsecondary on a palette
		el.setAttribute("scale", ".1 .1 .1")
		el.setAttribute("loadpolyfomthumbnail", "") // that could then be used to execute on pinch based on src property
		AFRAME.scenes[0].appendChild(el);
	} )
}

function loadFirstPolyModel(res){
	var n = 0;
	var i = res[n]
	var el = document.createElement("a-gltf-model");
	el.setAttribute("src", i.Thumbnail.replace("https://static.poly.pizza/","http://localhost:7777polydata/").replace("webp","glb")); 
	el.setAttribute("position", "0 1 "+n--);
	AFRAME.scenes[0].appendChild(el); 
	return el
}

function loadPolyModels(res){
// to load all models, rarely a good idea
	var n = 0;
	res.map( i => {
		var el = document.createElement("a-gltf-model");
		el.setAttribute("src", i.Thumbnail.replace("https://static.poly.pizza/","http://localhost:7777polydata/").replace("webp","glb")); 
		el.setAttribute("position", "0 1 "+n--);
		AFRAME.scenes[0].appendChild(el); 
		// optionally rescale e.g rescaleModelFromPoly(el) // probably has to wait for it to be properly loaded, cf modelHasLoaded event
			// e.g rescaleModelFromPoly ( loadFirstPolyModel(polys) ) won't work
	} )
}

function rescaleModelFromPoly(modelEl){
// rescale to fit in 1m3 box
	var bbox = new THREE.Box3().setFromObject( modelEl.object3D );
	var rescale = 1 / ( (( bbox.max.x - bbox.min.x) + (bbox.max.y - bbox.min.y) + (bbox.max.z - bbox.min.z) ) /3 );
	modelEl.setAttribute("scale", rescale+ " " + rescale + " " + rescale)
	// could also leave untouched if within boundaries, e.g > 0.1 and < 1
}

// SYNC WITH HMD EDITS before trying this
/*

source as URL e.g https://fabien.benetou.fr/Fabien/Principle?action=source (locally Fabien.Principle.pmwiki)
	usual parsing (e.g stop words)
	dedicated PmWiki cleanup e.g no URL
	clean up or rather highlight (e.g color not being black) with presence from https://github.com/wordset/wordset-dictionary
	could also have a short dictionnary of stop words based on popularity
		e.g https://en.wikipedia.org/wiki/Most_common_words_in_English#100_most_common_words
		but seems so short it might not help much, could try long and popular instead
WPM * distance travelled as metric, not just 1

can generate layout for keyboard as (Ctrl shortcut) copiable items to append to AR clipbard
	https://twitter.com/utopiah/status/1533690234424139779
		could also use an optional type in addition to target
			such items would be copied without pressing Ctrl

see remoteSave for saving to be able to use the result outside the HMD
*/

/*

use imagesFromURLs (used in screenstack) on https://vatelier.benetou.fr/MyDemo/newtooling/wiki_graph.json
       and line-link-entities="target:#instructionA; source:#instructionC" between pages

*/

// see https://remote-keyboard.glitch.me on how to provide a remote keyboard (no BT) for hud keydown/keyup events
	// consider alt server e.g 9000-peers-peerjsserver-bxw59h3fm87.ws-eu47.gitpod.io as peerjs isn't always reliable
	// to do the same offline could add to express too, cf https://github.com/peers/peerjs-server#combining-with-existing-express-app
//new Peer("2022xrkbd").on('connection', conn => conn.on('data', data => processRemoteInputData(data) ))
const altServer = "9000-peers-peerjsserver-bxw59h3fm87.ws-eu47.gitpod.io" 
//new Peer("2022xrkbd", {host: altServer}).on('connection', conn => conn.on('data', data => processRemoteInputData(data) ))
// disabled for now
function processRemoteInputData( data ){
	// .status : keydown keyup pointermove
		// on keydown or keyup, result un .key
		// on pointermove, result un .x and .y

	// could try to throw back as an event...
	parseKeys( data.status, data.key )
	if (data.status == "pointermove") parsePointer( data.x, data.y )
}

// for testing purposes, disable when not local with asset caching server
// SSE on a specific route to know if this file was updated, if so reload (would force leave VR) cf Inventing on Principle
/*
const source = new EventSource("streaming");
source.onmessage = message => { 
		console.log(message.data) // showing the updates without manually forcing a reload
		if ((JSON.parse(message.data)).status == "reload" ) location.reload(true); 
	} ;
*/
// monitored server-side, index.js with fs

/* extrusion and more generally compactness of 3D object description :

	Constructive Solid Geometry  (CSG) https://openjscad.nodebb.com/topic/235/threejs-integration/11 as example of integration of JSCAD (modelling with code basically) with threejs, naively looks like an interesting intersection, ideally with spacial editing after (i.e pinching a vertex to update the resulting geometry)
*/

// consider PinePhone keyboard as something more usable that BT rollable
	// PeerJS/WS(S) to share key.events
	// would also work with iPad keyboard ... or another other device with keyboard and browser.

// refactoring : consider pluggable execution models and targets e.g eval(), containers, Observable, etc
	// right now all mashed up together so creates both complexity and security risk

// consider also STT and translation experiment
// Codex by OpenAI (cf EP account) https://beta.openai.com/account/api-keys stored on ~/.openai-codex-test-xr used via backend
// with token e.g JWT could also consider ~/.bashrc ~/.bin or ~/Prototypes as commands
	// esp. those allowing to integrate with specific hardware

// load as page loads
// <a-text target observablecell="targetid:observablehq-numberOfPages-835aa7e9" position="0 1.55 -0.2" scale="0.1 0.1 0.1"></a-text>
// interactive
// <a-text target value="jxr obsv observablehq-numberOfPages-835aa7e9" position="0 1.55 -0.2" scale="0.1 0.1 0.1"></a-text>

function newNoteFromObservableCell( cell ){
	var targetEl = document.querySelector("#"+cell)
	var potentialRes = document.querySelector("#observablehq-numberOfPages-835aa7e9>span")
	if (potentialRes && potentialRes.children[1]){
	  addNewNote( potentialRes.children[1].innerText ) 
		return
	}

	let observer = new MutationObserver(mutationRecords => {
	  addNewNote( mutationRecords[0].addedNodes[0].children[1].innerText ) 
	});

	observer.observe(targetEl, {
	  childList: true, // observe direct children
	  subtree: true, // and lower descendants too
	  characterDataOldValue: true // pass old data to callback
	})
}

AFRAME.registerComponent('observablecell', { // non interactive mode
  schema: {
	  targetid: {type: 'string'}
  },
  init: function () {
	var el = this.el
	var targetEl = document.querySelector("#"+this.data.targetid)
	let observer = new MutationObserver(mutationRecords => {
	  addNewNote( mutationRecords[0].addedNodes[0].children[1].innerText )
	});

	observer.observe(targetEl, {
	  childList: true, // observe direct children
	  subtree: true, // and lower descendants too
	  characterDataOldValue: true // pass old data to callback
  });
}})

// might mess thing up on Quest somehow... like typing does not seem to work anymore since.

/*
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register(
        'sw-test/sw.js',
        {
          scope: '',
        }
      );
      if (registration.installing) {
        console.log('Service worker installing');
      } else if (registration.waiting) {
        console.log('Service worker installed');
      } else if (registration.active) {
        console.log('Service worker active');
      }
    } catch (error) {
      console.error(`Registration failed with ${error}`);
    }
  }
};
*/

// 2 modes : interact/display (see the .hidableenvironment class)
	// interact : small scale, 3D model of impact visible, keyboard visible, instruction visible
	// display : changeable scale, everything but content not visible

// could try new movements dedicated to modifying text, in particular dedicated to coding
	// e.g replacing a word by an expression el sa color red => dropping qs elname on el => qs elname sa color red

// for snapping display the current position (like now)
	// and future position as transparency when within a certain radius to target + offset
	// see getClosestTargetElement( pos ) when an object is already selected an moving
	// only snap there if within certain distance

// replace console with an in VR equivalent, at least during the try/catch of eval() to get some feedback

function displaySnappablePositions( position ){
	// to show while moving an object
	// has to be close enough (below threshold)
}

function coloredBlocksFromScreens(colors, el){
	// those are NOT updated at the moment
	colors.map( (u,i) => {
		var e = document.createElement("a-box")
		e.setAttribute("color", u.split(" ")[1])
		e.setAttribute("position",`2 1.8 -${i}`)
		e.setAttribute("width","0.2")
		e.setAttribute("depth","0.2")
		el.appendChild(e)
	})
}

function imagesFromURLs(urls, el, classes=null){
	urls.map( (u,i) => {
		var e = document.createElement("a-image")
		if (u.indexOf("http")>-1)
			e.setAttribute("src", u)
		else
			e.setAttribute("src", `screens/${u}`)
		//e.setAttribute("position",`0 1.8 -${i}`)
		e.setAttribute("position",`0 1.1 -${i/50}`) // flight mode
		e.setAttribute("rotation",`-30 0 0`) // flight mode
		e.setAttribute("scale", ".05 .05 .05") // have to scale down here otherwise move interactions aren't good
		// could instead rely on https://github.com/visjs/vis-timeline
		// as previously used  in https://mobile.twitter.com/utopiah/status/1110576751577567233
		e.setAttribute("width","2")
		if (classes) e.className += classes
		
		el.appendChild(e)
		targets.push(e)
	})
}

function URLs(urls, el){
	urls.map( (u,i) => {
		var e = document.createElement("a-text")
		e.setAttribute("value", u.split(" ")[1])
		e.setAttribute("position",`-1 1.25 -${i}`)
		// incorrect as screens (and their average color) are done per minute but URL done per change of tab
		//does not help, should be a text property instead 
		// e.setAttribute("width","10")
		e.setAttribute("text", "wrapCount","200")
		// el.appendChild(e) // disabled in flight mode
	})
}

function stringWithPositionFromCoordinates(pos){
	var el = getClosestTargetElement( pos, 0.5 )
	// loosen up the threshold as we normally pick from the top left

	// assumes a lot :
		// NO rotation of the text, at all!
		// single line of text
		// scale only of 1 depth and uniform scaling
		// left aligned
		// probably only positive values
	var selectedGlyph = {}
	selectedGlyph.index = -1 // if we get an empty string
	selectedGlyph.element = el
	if (!el) return selectedGlyph
	var glyph = el.object3D.children[0].geometry.visibleGlyphs
	const matches = glyph.map( (t,i) => {
			return {
				el: el,
				dist : Math.abs( pos.x - (
					el.object3D.position.x + t.position[0]/(150/el.object3D.scale.x) ) ),
				index : i
			}
		})
		.filter( t => t.dist < 0.5 )
		.sort( (a,b) => a.dist - b.dist )
		// https://twitter.com/utopiah/status/1532766336941686784
	if (matches.length > 0) {
		selectedGlyph.index = matches[0].index
	}
	return selectedGlyph
}

function plot(equation,variablename="x",scale=5,step=1){
	// could delete the past one document.querySelector("#plot")
	// but nice to compare curves... should rather avoid adding grids instead.
	var plot = document.querySelector("#plot")
	if (!plot){
		plot = document.createElement("a-entity")
		targets.push(plot) // adding only once
		plot.setAttribute("position", "0 1.5 -.5") // convenient position to test on desktop
		plot.setAttribute("scale", ".01 .01 .01")
		var idx = 0
		for (var i=-scale;i<=scale;i+=step){
			xl = `start: ${-scale} ${i} 0; end : ${scale} ${i} 0; opacity: 1;`
			// weirdest "trick"... something using only `` on setAttribute produces empty string
			// but indirecting once by setting a variable make the following one work?!
			plot.setAttribute("line__"+ ++idx, xl)
			plot.setAttribute("line__"+ ++idx, `start: ${i} ${-scale} 0; end : ${i} ${scale} 0; opacity: 1;`)
		}
		xaxis = `start: ${-scale} 0 0; end : ${scale} 0 0; opacity: 1; color:white;`
		plot.setAttribute("line__axis_x", xaxis)
		plot.setAttribute("line__axis_y", `start: 0 ${-scale} 0; end : 0 ${scale} 0; opacity: 1; color:white;`)
		plot.setAttribute("line__axis_z", `start: 0 0 ${-scale}; end : 0 0 ${scale}; opacity: 1; color:white;`)
		plot.id = "plot"
		AFRAME.scenes[0].appendChild( plot )
	}
	var previousPoint = null
	var curveId = +Date.now()
	idx = 0
	for (var i=-scale;i<=scale;i+=step/10){
		var pos = i + " " + eval( "x="+i +";"+ equation) + " .1"
		if (previousPoint) {
			plot.setAttribute("line__user"+curveId+"section"+ ++idx, 'start: ' + previousPoint+ '; end : ' + pos + '; color:red;')
		}
		previousPoint = pos
	}
	// variablename seems unused
}

AFRAME.registerComponent('target', {
  init: function () {
	targets.push( this.el )
	this.el.classList.add("collidable")
  }
})

AFRAME.registerComponent('line-link-entities', {
  schema: {
    source: {type: 'selector'},
    target: {type: 'selector'},
    steps: {type: 'number', default: 1},
  },
  init: function () {
    let generatorName = this.attrName
    setTimeout( _ => { // stupid... but works. 
 	    if (!this.data.source || !this.data.target) return
	    var sourcePos = this.data.source.object3D.position
	    var targetPos = this.data.target.object3D.position
 	    if (!sourcePos || !targetPos) return // might not be needed anymore
	    // adding a gltf inside an element prevents the parent from having coordinates (fast enough?)
	    var step = 0
	    var points = cut ([sourcePos, targetPos], 0, ++step)
	    points = cut (points, 0, ++step)
	    points = cut (points, points.length-2, step)
	    var el = this.el
	    el.className += generatorName
	    points.map( (p,i,arr) => {
	      if (arr[i+1])
		el.setAttribute("line__"+i, "start:" + AFRAME.utils.coordinates.stringify( arr[i] ) + ";end: " +  AFRAME.utils.coordinates.stringify( arr[i+1] ) )      
	    })
    }, 100 ) // could check instead if both elements have loaded
    
    function cut(points, pos, step){
      var a = points[pos]
      var b = points[pos+1]
      var midPos = new THREE.Vector3()
      midPos.copy(a).add(b).divideScalar(2)
      midPos.z -= a.distanceTo(b)/(step*10) // smoothed out but axis aligned
      return [...points.slice(0,pos+1), midPos, ...points.slice(pos+1)]
    }
  }
});

function tryCachedImageOtherwiseRenderLive(pages){
	let urls = []
	pages.map( i => {
		let cached = baseCachedURL + i.group + "_" + i.name + imageExtension
		urls.push( cached )
		fetch( cached).then( res => res.status ).then( r => { if (r==404) 
			// console.log("try to get new one", r, cached)
			replaceCachedImageByLive(i.group, i.name)
		} )
	})
	return urls
}

function replaceCachedImageByLive(group, name){
	const live = baseLiveURL+group+"_"+name+imageExtension
	fetch( live ).then( res => res.status ).then( r => {
		if (r==200) 
		// check if in the "new" cache before doing a live query first
			document.querySelector("[src='"+baseCachedURL+group+"_"+name+imageExtension+"']")
				.setAttribute("src", live)
		else
			fetch( queryFormatBaseURL+group+"/"+name+renderSuffix ).then( res => res.json() )
			.then( document.querySelector("[src='"+baseCachedURL+group+"_"+name+imageExtension+"']")
				.setAttribute("src", live)
			)
	} )
}

AFRAME.registerComponent('screenstack', {
// this could be potentially be replaced with web-url
  init: function () {
	//load()
	//if (cabin && cabin.length > 0) return // test doesn't seem to work well on new page / 1st load
		  // see CEREMA project, seems to handle caching better
	var el = this.el
	let generatorName = this.attrName
	fetch(wikiAsImages).then(response => response.json()).then(data =>
		imagesFromURLs(
			tryCachedImageOtherwiseRenderLive(
				Object.entries(data.Nodes).map(( [k, v] ) => { return {group:v.Group, name:v.Label} } ).slice(0,maxItems)
			)
		, el, generatorName )
	)
	// example time sorting
	/* fetch('/screens').then(response => response.json()).then(data => console.log(
		  data.files.filter( i => i.indexOf("_000") < 0 ).map( i => Number(i.replace(".png", "")) ).filter( i => i > now-60 ) 
	) )
        */

	// works only locally for privacy reasons.
	//fetch('colors.txt').then(response => response.text()).then(data => coloredBlocksFromScreens(data.split("\n").splice(-maxItems), el))
	// timings should match as colors are generated from the screens

	//fetch('currentURL.txt').then(response => response.text()).then(data => URLs(data.split("\n").splice(-maxItems), el ))
	// could slice the array based on dates and e.g limit on current day or last 24hrs
  }
});

function getClosestTargetElements( pos, threshold=0.05 ){ 
	// TODO Bbox intersects rather than position
	return targets.filter( e => e.getAttribute("visible") == true).map( t => { return { el: t, dist : pos.distanceTo(t.getAttribute("position") ) } })
		.filter( t => t.dist < threshold ) 
		.sort( (a,b) => a.dist > b.dist)
}

function getClosestTargetElement( pos, threshold=0.05 ){ // 10x lower threshold for flight mode
	var res = null
	const matches = getClosestTargetElements( pos, threshold)
	if (matches.length > 0) res = matches[0].el
	return res
}
	
/*
alternatively could looks for the intersecting bounding boxes of all targets
then from those pick the closest one (again based on center)

Both work well... but without any depth/thickness the chance of intersection are null...
extruding the plane to a volume on a known axis, e.g z here (no rotation) is trivial but limiting.

Could rely on the bounding sphere instead but not ideal when text is beside other pieces of text

Note that in practice we plan to bring geometry with the text, a la Scratch, to showcase grammar and potential to combine.
Consequently those problems would probably go away by intersecting with that geometry instead.

That still means an efficient solution, e.g convex hull or BVH
*/

// e.g addBackgroundBoxToTextElements( targets.filter( e => e.localName == "a-text" ) )
// note that background is "just" for the user in the sense that an invisible bounding box is enough for interactions
function addBackgroundBoxToTextElements( textElements ){
	textElements.map( el => {

		addBoundingBoxToTextElement( el )

		var bbox = new THREE.Box3().setFromObject( el.object3D.children[0] )
			// the text element itself has no volume whereas its first children is a mesh
		var scale = el.getAttribute("scale").x // assume being uniform
		var box = document.createElement("a-box")
		el.appendChild( box )
		box.setAttribute("width", (bbox.max.x - bbox.min.x) * 1/scale)
		box.setAttribute("height", (bbox.max.y - bbox.min.y) * 1/scale)
		box.setAttribute("depth", scale)
		box.setAttribute("position", (bbox.max.x - bbox.min.x) * (1/scale) / 2 + " 0 " + -scale/2+0.0001 )

		setTimeout( _ => { // AFrame induced delay
			// should check instead how to make sure an object is indeed created.
				// maybe via el.getObject3D()
			var compoundbbox = new THREE.Box3().setFromObject( box.object3D )
			compoundbbox.expandByObject( el.object3D )
			var helperbox = new THREE.BoxHelper( box.object3D, 0x00ff00);
			helperbox.update();
			AFRAME.scenes[0].object3D.add(helperbox);
			/*
			var helpercompound = new THREE.BoundingBoxHelper( compoundbbox, 0x0000ff);
			helpercompound.update();
			AFRAME.scenes[0].object3D.add(helpercompound);
			*/
		}, 100)
	})
}

function addBoundingBoxToTextElement( el ){
	var meshEl = el.object3D.children.filter( e => (e.type == "Mesh") )[0]
	var helper = new THREE.BoxHelper(meshEl, 0xff0000);
		// otherwise doesn't work with icon...
	helper.update();
	AFRAME.scenes[0].object3D.add(helper);
	el.setAttribute("box-uuid", helper.uuid )
	groupHelpers.push( helper )
}

function removeBoundingBoxToTextElement( el ){
	var uuid = el.getAttribute("box-uuid")
	el.removeAttribute("box-uuid")
	//AFRAME.scenes[0].object3D.traverse( e => { if (e.uuid == uuid) e.removeFromParent() })
	//AFRAME.scenes[0].object3D.traverse( e => { if (e.uuid == uuid) AFRAME.scenes[0].object3D.remove(e) })
	AFRAME.scenes[0].object3D.traverse( e => { console.log(e.uuid == uuid) })
	AFRAME.scenes[0].object3D.traverse( e => { if (e.uuid == uuid) console.log("found", e)})
		// somehow removing did work before ...
}

function groupSelectionToNewNote(){
	var text = ""
	groupSelection.map( grpel => {
		//removeBoundingBoxToTextElement( grpel )
			// somehow fails...
		text += grpel.getAttribute("value") + "\n"
	})
	groupHelpers.map( e => e.removeFromParent() )
	groupHelpers = []
	groupSelection = []
	addNewNote( text )
}

function addToGroup( position ){
	var el = getClosestTargetElement( position )
	if (!el) return
	groupSelection.push( el )
	addBoundingBoxToTextElement( el )
}

function appendToFeedbackHUD(txt){
	setFeedbackHUD( document.querySelector("#feedbackhud").getAttribute("value") + " " + txt )
}

function setFeedbackHUD(txt){
	document.querySelector("#feedbackhud").setAttribute("value",txt)
	setTimeout( _ => document.querySelector("#feedbackhud").setAttribute("value","") , 2000) 
}

function appendToHUD(txt){
	const textHUD = document.querySelector("#typinghud").getAttribute("value") 
	if ( textHUD == startingText)
		setHUD( txt )
	else
		setHUD( textHUD + txt )
}

function setHUD(txt){
	document.querySelector("#typinghud").setAttribute("value",txt)
}

AFRAME.registerComponent('waistattach',{
  schema: {
    target: {type: 'selectorAll'},
  },
  init: function () {
	var el = this.el
	this.worldPosition=new THREE.Vector3();
  },
  tick: function () {
	var worldPosition=this.worldPosition;
	worldPosition.copy(this.el.object3D.position);this.el.object3D.parent.updateMatrixWorld();this.el.object3D.parent.localToWorld(worldPosition)
	Array.from( this.data.target ).map( t => {
		t.object3D.position.x = worldPosition.x
		t.object3D.position.z = worldPosition.z
	})
  },
});

AFRAME.registerComponent('attach',{
  schema: {
    target: {type: 'selector'},
  },
  init: function () {
	var el = this.el
	this.worldPosition=new THREE.Vector3();
  },
  tick: function () {
	  var worldPosition=this.worldPosition;
	  worldPosition.copy(this.el.position);
	  this.el.parent.updateMatrixWorld();
	  this.el.parent.localToWorld(worldPosition)
	  rotation = this.el.rotation.x*180/3.14 + " " + this.el.rotation.y*180/3.14 + " " + this.el.rotation.z*180/3.14
	  this.data.target.setAttribute("rotation", rotation)
	  this.data.target.setAttribute("position",
		  AFRAME.utils.coordinates.stringify( worldPosition ) )
  },
  remove: function() {
  }
});

AFRAME.registerComponent('wristattachsecondary',{
  schema: {
    target: {type: 'selector'},
  },
  init: function () {
	var el = this.el
	this.worldPosition=new THREE.Vector3();
  },
  tick: function () {
	// could check if it exists first, or isn't 0 0 0... might re-attach fine, to test
		  // somehow very far away... need to convert to local coordinate probably
		  // localToWorld?
	(primarySide == 0) ? secondarySide = 1 : secondarySide = 0
	var worldPosition=this.worldPosition;
	this.el.object3D.traverse( e => { if (e.name == "wrist") {
		worldPosition.copy(e.position);e.parent.updateMatrixWorld();e.parent.localToWorld(worldPosition)
		rotation = e.rotation.x*180/3.14 + " " + e.rotation.y*180/3.14 + " " + e.rotation.z*180/3.14
		this.data.target.setAttribute("rotation", rotation)
		this.data.target.setAttribute("position",
				AFRAME.utils.coordinates.stringify( worldPosition ) )
			  // doesnt work anymore...
		//this.data.target.setAttribute("rotation", AFRAME.utils.coordinates.stringify( e.getAttribute("rotation") )
	  }
	})
  },
  remove: function() {
	// should remove event listeners here. Requires naming them.
  }
});

AFRAME.registerComponent('pinchsecondary', { 
  init: function () {
	this.el.addEventListener('pinchended', function (event) {
		selectedElement = getClosestTargetElement( event.detail.position )
		selectedElements.push({element:selectedElement, timestamp:Date.now(), primary:false})
		// if close enough to a target among a list of potential targets, unselect previous target then select new
		if (selectedElement) interpretJXR( selectedElement.getAttribute("value") )
		selectedElement = null
		if (setupMode) setupBBox["B"] = event.detail.position
		if ( setupBBox["A"] && setupBBox["B"] ) {
			setupMode = false
			setFeedbackHUD( JSON.stringify(setupBBox))
		}
		/*
		selectionPinchMode = false
		setHUD( AFRAME.utils.coordinates.stringify( bbox.min ),
			AFRAME.utils.coordinates.stringify( bbox.max ) )
		bbox.min.copy( zeroVector3 )
		bbox.man.copy( zeroVector3 )
	       */
	});
	this.el.addEventListener('pinchmoved', function (event) {
		if (selectionPinchMode){
			bbox.min.copy( event.detail.position )
			setFeedbackHUD( "selectionPinchMode updated min")
			if (!bbox.max.equal(zeroVector3))
				selectionBox.update();
		}
	});
	this.el.addEventListener('pinchstarted', function (event) {
		if (!selectionPinchMode) bbox.min.copy( zeroVector3 )
		if (selectionPinchMode) setFeedbackHUD( "selectionPinchMode started")
	});
  },
  remove: function() {
	// should remove event listeners here. Requires naming them.
  }
});

AFRAME.registerComponent('pinchprimary', { // currently only 1 hand, the right one, should be switchable

// consider instead https://github.com/AdaRoseCannon/handy-work/blob/main/README-AFRAME.md for specific poses
// or https://aframe.io/aframe/examples/showcase/hand-tracking/pinchable.js 

  init: function () {
	var el = this.el
	this.el.addEventListener('pinchended', function (event) { 
		// if positioned close enough to a target zone, trigger action
			// see own trigger-box component. Could use dedicated threejs helpers instead.
				// https://github.com/Utopiah/aframe-triggerbox-component/blob/master/aframe-triggerbox-component.js#L66
			// could make trigger zones visible as debug mode
		var closests = getClosestTargetElements( event.detail.position )
		//if (closests && closests.length > 0) // avoiding self reference
		//	setFeedbackHUD("close enough, could stack with "+ closests[1].el.getAttribute("value") )
		var dist = event.detail.position.distanceTo( document.querySelector("#box").object3D.position )
		if (dist < .1){
			setFeedbackHUD("close enough, replaced shortcut with "+ selectedElement.getAttribute("value") )
			wristShortcut = selectedElement.getAttribute("value")
		}
		if (selectedElement){
			let content = selectedElement.getAttribute("value")
			if (content && immersClient && immersClient.connected){
				immersClient.place.location = {
					position: AFRAME.utils.coordinates.stringify(event.detail.position),
					rotation: AFRAME.utils.coordinates.stringify( selectedElement.getAttribute("rotation") )
				};
				immersClient.sendChatMessage(content, "public"); 
			}
			selectedElements.push({element:selectedElement, timestamp:Date.now(), primary:true})
			selectedElement.emit('released')
		}
		// unselect current target if any
		selectedElement = null;
		save()
		if (setupMode) setupBBox["A"] = event.detail.position
			// somehow keeps on setting up... shouldn't once done.
		if ( setupBBox["A"] && setupBBox["B"] ) {
			setupMode = false
			setFeedbackHUD( JSON.stringify(setupBBox))
		}
		if ( drawingMode ) draw( event.detail.position )
		if ( groupingMode ) addToGroup( event.detail.position )
		selectionPinchMode = false
		/*
		setHUD( AFRAME.utils.coordinates.stringify( bbox.min ),
			AFRAME.utils.coordinates.stringify( bbox.max ) )
		bbox.min.copy( zeroVector3 )
		bbox.man.copy( zeroVector3 )
	       */
		setTimeout( _ => primaryPinchStarted = false, 200) // delay otherwise still activate on release
	
		var newPinchPos = new THREE.Vector3()
		newPinchPos.copy(event.detail.position )
		pinches.push({position:newPinchPos, timestamp:Date.now(), primary:true})
		dl2p = distanceLastTwoPinches()

	});
	this.el.addEventListener('pinchmoved', function (event) { 
		// move current target if any
		if (selectionPinchMode){
			bbox.max.copy( event.detail.position )
			if (!bbox.min.equal(zeroVector3))
				selectionBox.update();
		}
		if (selectedElement && !groupingMode) {
			selectedElement.setAttribute("position", event.detail.position)
			document.querySelector("#rightHand").object3D.traverse( e => {
				if (e.name == "ring-finger-tip"){
					selectedElement.object3D.rotation.copy( e.rotation )
				}
			})
			// rotation isn't ideal with the wrist as tend not have wrist flat as we pinch
		}
		if (selectedElement) selectedElement.emit("moved")
	});
	this.el.addEventListener('pinchstarted', function (event) {
		primaryPinchStarted = true
		if (!selectionPinchMode) bbox.max.copy( zeroVector3 )

		//var clone = getClosestTargetElement( event.detail.position ).cloneNode()
		// might want to limit cloning to unmoved element and otherwise move the cloned one
		//AFRAME.scenes[0].appendChild( clone )
		//targets.push( clone )
		//selectedElement = clone

		selectedElement = getClosestTargetElement( event.detail.position )
		if (selectedElement) selectedElement.emit("picked")
		// is it truly world position? See https://github.com/aframevr/aframe/issues/5182
		// setFeedbackHUD( AFRAME.utils.coordinates.stringify( event.detail.position ) )
		// if close enough to a target among a list of potential targets, unselect previous target then select new
	});
  },
  remove: function() {
	// should remove event listeners here. Requires naming them.
  }
});

// testing on desktop
function switchToWireframe(){
	visible = !visible
	/*
	targets.map( e => {
			scale = 50// should be a variable instead
			e.setAttribute("scale", visible ? ".05 .05 .05" : ".1 .1 .1" )
			var pos = AFRAME.utils.coordinates.parse( e.getAttribute("position") )
			//visible ? pos.z *= scale : pos.z /= scale // might be the opposite but anyway give the principle
			e.setAttribute("position", AFRAME.utils.coordinates.stringify(pos))
			// should actually be just for src, not for text notes... even though could be interesting
	})
	*/
	var model = document.querySelector("#environment").object3D
	model.traverse( o => { if (o.material) {
			o.material.wireframe = visible;
			o.material.opacity = visible ? 0.05 : 1;
			o.material.transparent = visible;
	} })
}

// add (JXR) shortcuts as PIM function from e.g https://observablehq.com/@utopiah/from-pim-to-2d-to-3d-to-xr-explorations
	// allowing to search within PIM then show manipulable pages as preview.

// note that can be tested in VR also as jxr switchToWireframe()
	// could make for nice in VR testing setup as eved notes

function enterSetupMode(){
	// rely on 2 pinches to create a bounding box of safe interaction
	// https://threejs.org/docs/#api/en/math/Box3.containsBox
	setupMode = true
}

AFRAME.registerComponent('start-on-press', {
	// should become a property of the component instead to be more flexible.
	init: function(){
		var el = this.el
		this.el.addEventListener('pressedended', function (event) { 
			if (!primaryPinchStarted && wristShortcut.match(prefix)) interpretJXR(wristShortcut)
			// other action could possibly based on position relative to zones instead, i.e a list of bbox/functions pairs
		})
	}
})
//---- other components : ------
// could become like https://twitter.com/utopiah/status/1264131327269502976
	// can include a mini typing game to warm up finger placement

function distanceLastTwoPinches(){
	let dist = null
	if (pinches.length>1){
		dist = pinches[pinches.length-1].position.distanceTo( pinches[pinches.length-2].position )
	}
	return dist
}

function startSelectionVolume(){
	selectionPinchMode = true
	// see setupBBox in pinchprimary and pinchsecondary
	// then addBoundingBoxToTextElement()
}
// note that the bbox with vertical position model is still interesting
	// (if within bounding box, try to execute code)
	// because it allows grouping and sequentially rather executing line by line
	// see https://threejs.org/docs/#api/en/math/Box3.containsBox

// save pose of targets and src locally and if available on PIM
/*
savingJSON = targets.map( e => {
	rot : e.getAttribute("rotation"),
	pos : e.getAttribute("position"), 
	scale : e.getAttribute("scale"), 
	src : e.getAttribute("src"), 
	value : e.getAttribute("value"), 
})
*/
// load alt set of items e.g from https://observablehq.com/@utopiah/from-pim-to-2d-to-3d-to-xr-explorations
	// or https://fabien.benetou.fr/pub/home/pimxr-experimentation/sources.json

// position should be configurable as rotation is handled by the OS

function parsePointer( x,y ){
		console.log(x,y)
	if (!sketchEl) {
		sketchEl = document.createElement("a-entity")
		// sketchEl.setAttribute("position", "0 1.4 -0.3") otherwise lines don't align
			// could counter that offset but might be problematic later on with translations/rotations
		targets.push( sketchEl )
		AFRAME.scenes[0].appendChild(sketchEl)
	}
	var el = document.createElement("a-sphere")
	var pos = x/1000 + " " + y/1000 + " 0"
		// should offset and flip properly
	el.setAttribute("position", pos)
	el.setAttribute("radius", 0.01)
	el.setAttribute("color", "green")
	sketchEl.appendChild( el )
	if (lastPointSketch){
		var oldpos = AFRAME.utils.coordinates.stringify( lastPointSketch.getAttribute("position") )
		sketchEl.setAttribute("line__"+ Date.now(), `start: ${oldpos}; end : ${pos};`)
	}
	lastPointSketch = el
	
}

function parseKeys(status, key){
	var e = hudTextEl
	if (status == "keyup"){
		if (key == "Control"){
			groupingMode = false
			groupSelectionToNewNote()
		}
	}
	if (status == "keydown"){
		var txt = e.getAttribute("value") 
		if (txt == "[]") 
			e.setAttribute("value", "")
		if (key == "Backspace" && txt.length)
			e.setAttribute("value", txt.slice(0,-1))
		if (key == "Control")
			groupingMode = true
		if (key == "Shift" && selectedElement)
			e.setAttribute("value", selectedElement.getAttribute("value") )
		else if (key == "Enter") {
			if ( selectedElement ){
				var clone = selectedElement.cloneNode()
				clone.setAttribute("scale", "0.1 0.1 0.1")  // somehow lost
				AFRAME.scenes[0].appendChild( clone )
				targets.push( clone )
				selectedElement = clone
			} else {
				if (txt.match(prefix)) interpretJXR(txt)
				// check if text starts with jxr, if so, also interpret it.
				addNewNote(e.getAttribute("value"))
				e.setAttribute("value", "")
			}
		} else {
		// consider also event.ctrlKey and multicharacter ones, e.g shortcuts like F1, HOME, etc
			if (key.length == 1)
				e.setAttribute("value", e.getAttribute("value") + key )
		}
		save()
	}
}

var keyboardInputTarget = 'hud'
AFRAME.registerComponent('hud', {
	init: function(){
		var feedbackHUDel= document.createElement("a-troika-text")
		feedbackHUDel.id = "feedbackhud"
		feedbackHUDel.setAttribute("value", "")
		feedbackHUDel.setAttribute("position", "-0.05 0.01 -0.2") 
		feedbackHUDel.setAttribute("scale", "0.05 0.05 0.05") 
		this.el.appendChild( feedbackHUDel )
		var typingHUDel = document.createElement("a-troika-text")
		typingHUDel.id = "typinghud"
		typingHUDel.setAttribute("value", startingText)
		typingHUDel.setAttribute("position", "-0.05 0 -0.2") 
		typingHUDel.setAttribute("scale", "0.05 0.05 0.05") 
		this.el.appendChild( typingHUDel )
		hudTextEl = typingHUDel // should rely on the id based selector now
		document.addEventListener('keyup', function(event) {
			if (keyboardInputTarget != 'hud') return
			parseKeys('keyup', event.key)
		});
		document.addEventListener('keydown', function(event) {
			if (keyboardInputTarget != 'hud') return
			parseKeys('keydown', event.key)
		});
	}
})

function addNewNote( text, position=`-0.2 1.1 -0.1`, scale= "0.1 0.1 0.1", id=null, classes="notes", visible="true", rotation="0 0 0" ){
	var newnote = document.createElement("a-troika-text")
	newnote.setAttribute("anchor", "left" )
	newnote.setAttribute("outline-width", "5%" )
	newnote.setAttribute("outline-color", "black" )
	newnote.setAttribute("visible", visible )

	if (id) 
		newnote.id = id
	else
		newnote.id = "note_" + Date.now() // not particularly descriptive but content might change later on
	if (classes)
		newnote.className += classes
	newnote.setAttribute("side", "double" )
	var userFontColor = AFRAME.utils.getUrlParameter('fontcolor')
	if (userFontColor && userFontColor != "") 
		newnote.setAttribute("color", userFontColor )
	else 
		newnote.setAttribute("color", fontColor )
	if (text.match(prefix))
		newnote.setAttribute("color", codeFontColor )
	newnote.setAttribute("value", text )
	//newnote.setAttribute("font", "sw-test/Roboto-msdf.json")
	newnote.setAttribute("position", position)
	newnote.setAttribute("rotation", rotation)
	newnote.setAttribute("scale", scale)
	AFRAME.scenes[0].appendChild( newnote )
	targets.push(newnote)
	return newnote
}

function interpretAny( code ){

	if (!code.match(/^dxr /)) return
	var newcode = code
	newcode = newcode.replace("dxr ", "")
	//newcode = newcode.replace(/bash ([^\s]+)/ ,`debian '$1'`) // syntax delegated server side
	fetch("/command?command="+newcode).then( d => d.json() ).then( d => {
		console.log( d.res )
		appendToHUD( d.res ) // consider shortcut like in jxr to modify the scene directly
		// res might return that said language isn't support
			// commandlistlanguages could return a list of supported languages
	})
}

var pastPoints = []
function draw( position ){
	let drawingMoment = +Date.now() // might not be fast enough to get a UUID
	let uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
	// from https://stackoverflow.com/a/44078785/1442164
	let pos = AFRAME.utils.coordinates.stringify( position )
	// add sphere per point
	let el = document.createElement("a-sphere")
	let drawing
	el.setAttribute("position", pos)
	el.setAttribute("radius", 0.001)
	el.setAttribute("color", "lightblue")
	el.setAttribute("dateadded", drawingMoment )
	// if previous point exist, draw line between both
	if (pastPoints.length) {
		let previousPoint = pastPoints[pastPoints.length-1] // should check time, e.g max 1s
		drawing = previousPoint.element.parentElement
		let oldpos = AFRAME.utils.coordinates.stringify( previousPoint.position )
		drawing.setAttribute("line__"+ uniqueId, `start: ${oldpos}; end : ${pos};`)
	} else {
		drawing = document.createElement("a-entity")
		drawing.className = "drawing"
		AFRAME.scenes[0].appendChild( drawing )
	}
	drawing.appendChild( el )
	// if sufficiently close to another sphere (the first) close the loop
	if (pastPoints.length>1) {
		let lastPoint = pastPoints[pastPoints.length-1]
		let oldpos = AFRAME.utils.coordinates.stringify( lastPoint.position )
		let lastPosV3 = new THREE.Vector3().copy( lastPoint.position )
		if (lastPosV3.distanceTo( position ) < 0.1) // threshold
			drawing.setAttribute("line__"+ drawingMoment + "_closeloop", `start: ${oldpos}; end : ${pos};`)
			// then enter extrude mode (assume they are on 1 plane)
			// should also prevent from adding points to the current drawing
			// before investing too much effort in this, should consider how it would actually improve usage
			// especially as we can add AFrame primitives with the keyboard
				// intersection of kbd and hand tracked 6DoF being the primary usage
	}

	pastPoints.push({position:pos, element:el, timestamp: drawingMoment})
	/* test values, must wait .1 second between otherwise there is no known position
		(most likely AFrame to threejs delay)
	draw( new THREE.Vector3(-0.04, 1.7, -1) );
	draw( new THREE.Vector3(0.04, 1.7, -1) );
	draw( new THREE.Vector3(0, 1.72, -1) );
	*/


}

// the goal is to associate objects as shape with volume to code snippet
function addGltfFromURLAsTarget( url, scale=1, position="0 1.7 -0.3" ){
	var el = document.createElement("a-entity")
	AFRAME.scenes[0].appendChild(el)
	el.setAttribute("gltf-model", url)
	el.setAttribute("position", position) 
	el.setAttribute("scale", scale + " " + scale + " " + scale)
	targets.push(el)

	return el
	// consider https://sketchfab.com/developers/download-api/downloading-models/javascript
}

function showhistory(){
	setFeedbackHUD("history :\n")
	commandhistory.map( i => appendToHUD(i.uninterpreted+"\n") )
}

function saveHistoryAsCompoundSnippet(){
	addNewNote( commandhistory.map( e => e.uninterpreted ).join("\n") )
}

function bindVariableValueToNewNote(variableName){
	// from observe jxr keyword
	const idName = "bindVariableValueToNewNote"+variableName
	addNewNote( variableName + ":" + eval(variableName), `-0.15 1.4 -0.1`,  "0.1 0.1 0.1", idName, "observers", "true" )
	// could add to the HUD instead and have a list of these
	return setInterval( _ => {
		const value = variableName+";"+eval(variableName)
		// not ideal for DOM elements, could have shortcuts for at least a-text with properties, e.g value or position
		document.getElementById(idName).setAttribute("value", value)
	}, 100 )
}

function parseJXR( code ){
// should make reserved keywords explicit.
	var newcode = code
	newcode = newcode.replace("jxr ", "")
	newcode = newcode.replace(/(\d)s (.*)/ ,`setTimeout( _ => { $2 }, $1*1000)`)

	// qs X => document.querySelector("X")
	newcode = newcode.replace(/qs ([^\s]+)/ ,`document.querySelector('$1')`)

	// sa X Y => .setAttribute("X", "Y")
	newcode = newcode.replace(/ sa ([^\s]+) (.*)/,`.setAttribute('$1','$2')`)
		// problematic for position as they include spaces

	newcode = newcode.replace(/obsv ([^\s]+)/ ,`newNoteFromObservableCell('$1')`)

	// TODO
	//<a-text target value="jxr observe selectedElement" position="0 1.25 -0.2" scale="0.1 0.1 0.1"></a-text>
	newcode = newcode.replace(/observe ([^\s]+)/,`bindVariableValueToNewNote('$1')`)
	// could proxy instead... but for now, the quick and dirty way :

	// e.g qs a-sphere sa color red => 
	// document.querySelector("a-sphere").setAttribute("color", "red")

	newcode = newcode.replace(/lg ([^\s]+) ([^\s]+)/ ,`addGltfFromURLAsTarget('$1',$2)`)
	// order matters, here we only process the 2 params if they are there, otherwise 1
	newcode = newcode.replace(/lg ([^\s]+)/ ,`addGltfFromURLAsTarget('$1')`)
	return newcode
}

function interpretJXR( code ){
	if (!code) return
	if (code.length == 1) { // special case of being a single character, thus keyboard
		if (code == ">") { // Enter equivalent
			content =  hudTextEl.getAttribute("value") 
			if (Number.isFinite(Number(content))) {
				loadPageRange(Number(content));
			} else {
				addNewNote( content )
			}
			setHUD("")
		} else if (code == "<") { // Backspace equivalent
			setHUD( hudTextEl.getAttribute("value").slice(0,-1))
		} else {
			appendToHUD( code )
		}
	}
	if (!code.match(prefix)) return
	var uninterpreted = code
	var parseCode = ""
	code.split("\n").map( lineOfCode => parseCode += parseJXR( lineOfCode ) + ";" )
	// could ignore meta code e.g showhistory / saveHistoryAsCompoundSnippet
	commandhistory.push( {date: +Date.now(), uninterpreted: uninterpreted, interpreted: parseCode} )
	
	console.log( parseCode )
	try {
		eval( parseCode )
	} catch (error) {
		console.error(`Evaluation failed with ${error}`);
	}

	// unused keyboard shortcuts (e.g BrowserSearch) could be used too
	// opt re-run it by moving the corresponding text in target volume
}

AFRAME.registerComponent('toolbox', { // ununsed
	init: function(){
		var el = this.el
		var e = document.createElement("a-sphere")
		e.setAttribute("scale", "0.1 0.1 0.1")
		e.setAttribute("color", "lightblue")
		e.setAttribute("pressable")
		e.id = "toolboxsphere"
		el.appendChild( e )
		var e = document.createElement("a-cylinder")
		e.setAttribute("scale", "0.1 0.1 0.1")
		e.setAttribute("color", "darkred")
		e.setAttribute("pressable")
		e.id = "toolboxcylinder"
		el.appendChild( e )
		var e = document.createElement("a-box")
		e.setAttribute("scale", "0.1 0.1 0.1")
		e.setAttribute("color", "pink")
		e.setAttribute("pressable")
		e.id = "toolbox"
		el.appendChild( e )
	},
	tick: function(){
		var toolbox = document.querySelector("#toolbox")
		var cam = document.querySelector("[camera]")
		toolbox.object3D.position.x = cam.getAttribute("position").x-0.5
		toolbox.object3D.position.z = cam.getAttribute("position").z+0.2
		//toolbox.object3D.rotation.y = cam.getAttribute("rotation").y
	}
})

// from https://aframe.io/aframe/examples/showcase/hand-tracking/pressable.js
AFRAME.registerComponent('pressable', {
	schema:{pressDistance:{default:0.06}},
	init:function(){this.worldPosition=new THREE.Vector3();this.handEls=document.querySelectorAll('[hand-tracking-controls]');this.pressed=false;},
	tick:function(){var handEls=this.handEls;var handEl;var distance;for(var i=0;i<handEls.length;i++){handEl=handEls[i];distance=this.calculateFingerDistance(handEl.components['hand-tracking-controls'].indexTipPosition);if(distance<this.data.pressDistance){if(!this.pressed){this.el.emit('pressedstarted');} this.pressed=true;return;}} if(this.pressed){this.el.emit('pressedended');} this.pressed=false;},
	calculateFingerDistance:function(fingerPosition){var el=this.el;var worldPosition=this.worldPosition;worldPosition.copy(el.object3D.position);el.object3D.parent.updateMatrixWorld();el.object3D.parent.localToWorld(worldPosition);return worldPosition.distanceTo(fingerPosition);}
});

AFRAME.registerComponent('selectionboxonpinches', {
	init:function(){
		AFRAME.scenes[0].object3D.add(selectionBox);
	}
})

AFRAME.registerComponent('keyboard', {
	init:function(){
		let generatorName = this.attrName
		const horizontaloffset = .7
		const horizontalratio = 1/20
		alphabet.map( (line,ln) => {
		 for (var i = 0; i < line.length; i++) {
			var pos = i * horizontalratio - horizontaloffset
                        addNewNote( line[i], pos+" "+(1.6-ln*.06)+" -.4", ".1 .1 .1", null, generatorName)
		 }
		})
	}
})
	
AFRAME.registerComponent('capturegesture', {
	init:function(){this.handEls=document.querySelectorAll('[hand-tracking-controls]');},
	tick:function(){
		document.querySelector("#rightHand").object3D.traverse( e => { if (e.name == "b_r_wrist") console.log("rw", e.rotation) })
		document.querySelector("#leftHand" ).object3D.traverse( e => { if (e.name == "b_l_wrist") console.log("rl", e.rotation) })
			// should look up thumb-metacarpal and index-finger-metacarpal if not sufficient
				// might trickle down iif wrist rotation itself is already good
			// https://immersive-web.github.io/webxr-hand-input/
	}
});

AFRAME.registerComponent('timeline', {
        init:function(){
		let generatorName = this.attrName
                fetch("../content/fot_timeline.json").then(res => res.json() ).then(res => {
                        res.fot_timeline.slice(0,maxItemsFromSources).map( (c,i) => addNewNote( c.year+"_"+c.event, "1 "+i/10+" -1", ".1 .1 .1", null, generatorName) ) 
                })
        },
});

AFRAME.registerComponent('glossary', {
	init:function(){
		let generatorName = this.attrName
		fetch("content/glossary.json").then(res => res.json() ).then(res => {
			Object.values(res.entries).slice(0,maxItemsFromSources).map( (c,i) => addNewNote( c.phrase + c.entry.slice(0,50)+"..." , "-1 "+i/10+" -1", ".1 .1 .1", null, generatorName) ) 
		})
	},
});

AFRAME.registerComponent('fot', {
	init:function(){
		this.tick = AFRAME.utils.throttleTick(this.tick, 500, this);
	},
	tick: function(){
		let generatorName = this.attrName
		fetch("https://fabien.benetou.fr/PIMVRdata/FoT?action=source#" + Date.now()).then(res => res.text() ).then(res => {
			res.split("\n").slice(0,maxItemsFromSources).map( (n,i) => {
				found = added.find((str) => str === n)
				if (typeof found === 'undefined'){
					added.push(n)
					addNewNote( n, "-1 "+(1+i/10)+" -2.5", ".1 .1 .1", null, generatorName ) 
				}
			})
		})
	}
});

AFRAME.registerComponent('issues', {
	init:function(){
		let generatorName = this.attrName
		// fetch("https://api.github.com/repos/Utopiah/relax-plus-think-space/issues").then(res => res.json() ).then(res => {
		fetch("https://git.benetou.fr/api/v1/repos/utopiah/text-code-xr-engine/issues").then(res => res.json() ).then(res => {
			res.slice(0,maxItemsFromSources).map( (n,i) => addNewNote( n.title, "0 "+(1+i/10)+" -1.8", ".1 .1 .1", null, generatorName ) )
		})
	},
});

AFRAME.registerComponent('dynamic-view', {
	init:function(){
		let generatorName = this.attrName
		fetch("content/DynamicView.json").then(res => res.json() ).then(res => {
			res.nodes.slice(0,maxItemsFromSources).map( n => addNewNote( n.title, "" + res.layout.nodePositions[n.identifier].x/100 + " " + res.layout.nodePositions[n.identifier].y/100 + " -1", ".1 .1 .1", null, generatorName ) )
		})
	},
});

function toggleVisibilityEntitiesFromClass(classname){
	let entities = Array.from( document.querySelectorAll("."+classname) )
	if (entities.length == 0) return
	let state = entities[0].getAttribute("visible") // assume they are all the same
	if (state)
		entities.map( e => e.setAttribute("visible", "false"))
	else
		entities.map( e => e.setAttribute("visible", "true"))
}

function pushLeftClass(classname, value=.1){
	Array.from( document.querySelectorAll("."+classname) ).map( e => e.object3D.position.x -= value)
}

function pushRightClass(classname, value=.1){
	Array.from( document.querySelectorAll("."+classname) ).map( e => e.object3D.position.x += value)
}

function pushUpClass(classname, value=.1){
	Array.from( document.querySelectorAll("."+classname) ).map( e => e.object3D.position.y += value)
}

function pushDownClass(classname, value=.1){
// can be used for accessibiliy, either directly or sampling e.g 10s after entering VR to lower based on the estimated user height
	Array.from( document.querySelectorAll("."+classname) ).map( e => e.object3D.position.y -= value)
}

function pushBackClass(classname, value=.1){
	Array.from( document.querySelectorAll("."+classname) ).map( e => e.object3D.position.z -= value)
}

function pushFrontClass(classname, value=.1){
	Array.from( document.querySelectorAll("."+classname) ).map( e => e.object3D.position.z += value)
}

function toggleVisibilityAllGenerators(){
	generators.split(" ").map( g => toggleVisibilityEntitiesFromClass(g) )
	// not hidableassets though
}

function toggleVisibilityAll(){
	toggleVisibilityAllGenerators()
	toggleVisibilityEntitiesFromClass("hidableassets")
}

function toggleVisibilityAllButClass(classname){
	generators.split(" ").filter( e => e != classname).map( g => toggleVisibilityEntitiesFromClass(g) )
	toggleVisibilityEntitiesFromClass("hidableassets")
}

AFRAME.registerComponent('adjust-height-in-vr', {
	init: function(){
		AFRAME.scenes[0].addEventListener("enter-vr", _ => {
			setTimeout( _ => { // getting the value right away returns 0, so short delay
				userHeight = document.querySelector("#player").object3D.position.y
				// assume the user does not change, some might prefer to use standing up first then sit down.
					// otherwise explicit controls
				heightAdjustableClasses.map( c => {
					max = Math.max.apply(null, Array.from( document.querySelectorAll("."+c) ).map( e => e.object3D.position.y) )	
					min = Math.min.apply(null, Array.from( document.querySelectorAll("."+c) ).map( e => e.object3D.position.y) )	
					pushDownClass(c, userHeight - (max-min)/2 )
					setFeedbackHUD( "adjusted height by:" + ( userHeight - (max-min)/2 ) )
				} )
			}, 100 )
		})
	}
})

AFRAME.registerComponent('commands-from-external-json', {
/*
// following discussion with Yanick

// for cabin.html to faciliate growth and flexibility

fetch('./commands.json') // then load like A-Frame elements
// e.g command //{name,defaultpose,autorun,description}
// could even be stored as wiki page

fetch('./templates.json')
// e.g [commands with optional pose]

// watch can be a template too
	<a-text side="double" networked="template:#text-template;attachTemplateToLocal:false;" id="instructionA" value="Interactive instructions:" position="0 1.5 -0.2" scale="0.2 0.2 0.2"></a-text>
	<a-text side="double" id="instructionB" target value="jxr lg Fox.glb 0.001" position="0 1.65 -0.2" scale="0.1 0.1 0.1">
		<a-entity gltf-model="Fox.glb" scale="0.005 0.005 0.005"></a-entity>
	</a-text>
	<a-text side="double" networked="template:#text-template;attachTemplateToLocal:false;" id="instructionC" target value="jxr obsv observablehq-numberOfPages-835aa7e9" position="0 1.55 -0.2" scale="0.1 0.1 0.1"></a-text>
	<a-text side="double" networked="template:#text-template;attachTemplateToLocal:false;" id="instructionD" target value="jxr 1s startSelectionVolume()" position="0 1.50 -0.2" scale="0.1 0.1 0.1"></a-text>
*/
	init:function(){
		var el = this.el
		let generatorName = this.attrName
		var links = [ // could be in the commands file instead
			"target:#instructionA; source:#instructionB",
			"target:#instructionA; source:#instructionC",
			"target:#instructionA; source:#instructionD",
		]
		links = []
		//fetch("commands.json").then(res => res.json() ).then(res => {
		var commandsURL = "https://fabien.benetou.fr/PIMVRdata/CabinCommands?action=source"
		commandsURL = "https://fabien.benetou.fr/PIMVRdata/EngineSequentialTutorialCommands?action=source" // new default
		var src = AFRAME.utils.getUrlParameter('commands-url')
		if (src && src != "") commandsURL = src
		fetch(commandsURL).then(res => res.json() ).then(res => {
			// to consider for remoteLoad/remoteSave instead, to distinguish from url though.
			// also potential security concern so might insure that only a specific user, with mandatory password access, added commands.
			var visible = true
			if (c.visible) visible = c.visible
			res.map( c => addNewNote( c.value, c.position, c.scale, c.id, generatorName, c.visible) )
				// missing name/title, autorun (true/false), description, 3D icon/visual, visiblity (useful for sequential tutorial)
			links.map( l => { var linkEl = document.createElement("a-entity"); 
					 linkEl.setAttribute("line-link-entities", l)
					 el.appendChild(linkEl) 
			} )
			var hideRest = AFRAME.utils.getUrlParameter('commands-hide-rest')
			if (hideRest && hideRest != "") setTimeout( _ => toggleVisibilityAllButClass('commands-from-external-json'), 5000) // waiting for everything to have loaded...
		})
	},
});

function save(){
	var data = targets.map( e => { return {
			localname: e.localName,
			src: e.getAttribute("src"),
			position: e.getAttribute("position"),
			rotation: e.getAttribute("rotation"),
			scale: e.getAttribute("scale"),
			value: e.getAttribute("value"),
		} } )
	cabin = data
	localStorage.setItem('cabin', JSON.stringify( data) )
	return data
	// could be called on page exit, unsure if reliable in VR
	// alternatively could be call after each content is moved or created
}

function load(){
	if (localStorage.getItem('cabin'))
		cabin = JSON.parse(localStorage.getItem('cabin'))
	cabin.map( e => {
		var newel = document.createElement(e.localname)
		savedProperties.map( p => {
			if (e[p] ) newel.setAttribute(p, e[p])
		})
		AFRAME.scenes[0].appendChild( newel )
	})
}

function remoteLoad(){
	fetch(url+'source') 
		.then( response => { return response.json() } )
		.then( data => { console.log("remote data:", data) })
	// does actually load back. Should consider what load() does instead.

	// for the reMarkable write back in source, OCR/HWR could be done on the WebXR device instead
		// alternatively "just" sending the .jpg thumbnail would be a good enough start
		// note that highlights are also JSON files
		// both might not be ideal directly in the original JSON but could be attachement as URLs
}

function remoteSave(){
	  fetch(url+'edit', {
		  method: 'POST',
		  headers: {'Content-Type':'application/x-www-form-urlencoded'},
		  body: "post=1&author=PIMVR&authpw=edit_password&text="+JSON.stringify( cabin )
	  }).then(res => res).then(res => console.log("saved remotely", res))
}

function switchSide(){
	// mostly works... but event listeners are not properly removed. Quickly creates a mess, low performance and unpredictable.
	document.querySelector("#"+sides[primarySide]+"Hand").removeAttribute("pinchprimary")
	document.querySelector("#"+sides[secondarySide]+"Hand").removeAttribute("pinchsecondary")
	document.querySelector("#"+sides[secondarySide]+"Hand").removeAttribute("wristattachsecondary")
	document.querySelector("#"+sides[secondarySide]+"Hand").setAttribute("pinchprimary", "")
	document.querySelector("#"+sides[primarySide]+"Hand").setAttribute("pinchsecondary", "")
	document.querySelector("#"+sides[primarySide]+"Hand").setAttribute("wristattachsecondary", "target: #box")
	if (primarySide == 0) {
		secondarySide = 0
		primarySide = 1
	} else {
		primarySide = 0
		secondarySide = 1
	}
}

function cloneAndDistribute(){
	el = document.querySelector("a-box[src]") // page
	// trying instead to rely on previously selected matching element and dl2p

	// lack visual feedback to show what is indeed lastly selected or the distance found
	//el = selectedElements[selectedElements.length-2] // not current command
	times = Math.floor(dl2p*10) // also assume it's been done properly
	if (times < 2) times = 7
	
	offset = .5
	 for (var i = 0; i < times ; i++) { // equivalent of Blender array modifier
		let newEl = el.cloneNode() 
		AFRAME.scenes[0].appendChild(newEl) // takes time...
		setTimeout( setZ, 100, {el: newEl, z: -1-i*offset} )
		newEl.addEventListener('hasLoaded', function (event) {
			//this.object3D.position.z = i*offset
			console.log("loaded") // doesnt seem to happen
		})
	 }

	function setZ(params){
		params.el.object3D.position.z = params.z
	}
}

function loadPageRange(start=1, end=-1, startPosition={x:0, y:1.3, z:-.7}, stepVector={x:.2, y:0, z:0}){
	const baseURL = "https://fabien.benetou.fr/pub/home/future_of_text_demo/content/book_as_png/gfg_d-"
	const extension = ".png"

	// assumes portrait A4-ish
	var rootEl = AFRAME.scenes[0]
	if (end<0) end = start
	
	let step = 0
	for (let i=start; i<=end; i++){
		step++
		let el = document.createElement("a-box")
		el.setAttribute("target", true)
		//el.setAttribute("position", ""+ step/5+ " 1.3 -.7") // could be based on selectedElements last position instead
		let pos = "" + startPosition.x+stepVector.x*step + " " + startPosition.y+stepVector.y*step + " " + startPosition.z+stepVector.z*step 
		el.setAttribute("position", pos)
		// layout system could be parametric, e.g over x or y or z or another system
		el.setAttribute("width", ".1")
		el.setAttribute("height", ".15")
		el.setAttribute("depth", ".01")
		pageNumber = i
		if (pageNumber<10) pageNumber = "0"+pageNumber
		if (pageNumber<100) pageNumber = "0"+pageNumber
		el.setAttribute("src", baseURL+pageNumber+extension)
		el.setAttribute("pagenumber", pageNumber)
		el.id = pageNumber + "_" + Date.now()
		rootEl.appendChild(el)
		let posInterface = "" + startPosition.x+stepVector.x*step + " " + startPosition.y+1+stepVector.y*step + " " + startPosition.z+stepVector.z*step 
		let UI = addNewNote("jxr nextPage('"+el.id+"')", posInterface, "0.1 0.1 0.1", el.id+"_interface")
		//el.setAttribute("attach","target:#"+el.id+"_interface")
	}
}

function writeWebDAV(){
	const webdavurl = "https://webdav.benetou.fr";
	const client = window.WebDAV.createClient(webdavurl)
	async function w(path = "/file.txt"){ return await client.putFileContents(path, "SpaSca test"); }
	w("/fot.txt") // need new permissions
}

function getPagesFromWebDAV(){
	const webdavurl = "https://webdav.benetou.fr";
	const client = window.WebDAV.createClient(webdavurl)
	async function getDirectory(path = "/"){ return await client.getDirectoryContents(path); }
	getDirectory("book_as_png").then( d => d.sort( (a,b) => (a.filename>b.filename)).slice(0,10).map( (c,i) => addPageFromURL(webdavurl+c.filename)))
}

function addPageFromURL(url){
	if (url.indexOf(".png")<0) return
	let el = document.createElement("a-box")
	el.setAttribute("position", -Math.random()+" "+Math.random()*3 + " -1")
	el.setAttribute("width", ".1")
	el.setAttribute("height", ".15")
	el.setAttribute("depth", ".01")
	el.setAttribute("src", url)
	AFRAME.scenes[0].appendChild(el)
	return el
}

function getModelsFromWebDAV(){
	const webdavurl = "https://webdav.benetou.fr";
	const client = window.WebDAV.createClient(webdavurl)
	async function getDirectory(path = "/"){ return await client.getDirectoryContents(path); }
	getDirectory("models").then( d => d.sort( (a,b) => (a.filename>b.filename)).slice(0,10).map( (c,i) => addModelFromURL(webdavurl+c.filename)))
}

function addModelFromURL(url){
	return addNewNote("jxr lg "+url+ " 0.001", -Math.random()+" "+Math.random()*3 + " -1")
	// should try boxing it instead in 1m3
}

// same principle to go from nextPage() to openingLinkedPages() from wiki URL
	// consider screenstack, could add a note to mode further

function loadWikiAsGraph(){
	fetch(wikiAsImages).then(response => response.json()).then(data => {
		Object.entries(data.Nodes).slice(0,maxItems).map( v => {
			let pageName = v[0]
			let targest = v[1].Targets
			let el = addPageFromURL(baseLiveURL+pageName.replace(".","_")+imageExtension)
			el.id = pageName
			el.classname = "wikipage"
			// should rely on tryCachedImageOtherwiseRenderLive(pages) instead
			setTimeout( _ => { 
				let pos = el.getAttribute("position")
				let UI = addNewNote("jxr openFromNode('"+el.id+"')", pos, "0.1 0.1 0.1", el.id+"_interface")
				console.log("should add: addNewNote('jxr openNewNode("+pageName+")')")
			}, 100 ) // wait for the entity to be actually added
			// to be coupled with loadCodeFromPage()
				// see also the idea that each wiki page wouldn't just be descriptive but also have code
					// related pages
					// https://fabien.benetou.fr/Fabien/Principle
					// https://fabien.benetou.fr/CognitiveEnvironments/CognitiveEnvironments
					// https://fabien.benetou.fr/Cookbook/Cognition
		})
	})
}

function nextPage(id){
console.log("nextpage()")
	// assuming only direct parent for now
	const baseURL = "https://fabien.benetou.fr/pub/home/future_of_text_demo/content/book_as_png/gfg_d-"
	const extension = ".png"
	let pageNumber = Number( id.split("_")[0] )
console.log(pageNumber+1)
	loadPageRange(pageNumber+1)
}

function loadCodeFromPage(url="https://fabien.benetou.fr/Analysis/BeyondTheCaseAgainstBooks?action=source"){
	// alternatively could load from a page number
	fetch(url)
	.then( r => r.text() )
	.then(data => { 
		let code = data.split("\n").filter( l => (l.slice(0,2) == "[@") )[0].slice(2).slice(0,-2);
		// example as PmWiki parsing
		eval(code)
	} )
}

function loadFromMastodon(statusesURL="https://mastodon.pirateparty.be/api/v1/accounts/56066/statuses"){
	fetch(statusesURL).then( r => r.json() ).then( t => t.filter( i => i.in_reply_to_id == null ).map( (i,n) => {
		let div = document.createElement("div")
		div.innerHTML = i.content
		addNewNote(div.innerText, "1 "+ (1.2+(n+1)/20) +" -0.4")
	} ) )
}

const tile_extension = ".glb"

// could become a dedicated asset sets, e.g asset-metadata.json in that directory
const available_asset_kits = [
	{
		tile_URL : "../content/asset_kits/KenneyHexTiles/",
		tiles : ["building_cabin", "building_castle", "building_dock", "building_farm", "building_house", "building_market", "building_mill", "building_mine", "building_sheep", "building_smelter", "building_tower", "building_village", "building_wall", "building_water", "dirt", "dirt_lumber", "grass", "grass_forest", "grass_hill", "path_corner", "path_cornerSharp", "path_crossing", "path_end", "path_intersectionA", "path_intersectionB", "path_intersectionC", "path_intersectionD", "path_intersectionE", "path_intersectionF", "path_intersectionG", "path_intersectionH", "path_start", "path_straight", "river_corner", "river_cornerSharp", "river_crossing", "river_end", "river_intersectionA", "river_intersectionB", "river_intersectionC", "river_intersectionD", "river_intersectionE", "river_intersectionF", "river_intersectionG", "river_intersectionH", "river_start", "river_straight", "sand", "sand_rocks", "stone", "stone_hill", "stone_mountain", "stone_rocks", "unit_boat", "unit_house", "unit_houseLarge", "unit_mill", "unit_tower", "unit_tree", "unit_wallTower", "water", "water_island", "water_rocks",],
		tiles_types_full : [ "building_", "river_", "sand", "stone", "water"],
		tiles_types_parts : [ "unit_", "path_" ],
		hex_type : true,
	},{
		tile_URL : "../content/asset_kits/KenneyRetroMedieval/",
		tiles_types_full : ["floor", "column", "tower", "wall"],
		tiles_types_parts : ["battlement"],
		tiles : [ "battlement", "battlement_cornerInner", "battlement_cornerOuter", "battlement_half", "column", "columnPaint", "columnPaint_damaged", "column_damaged", "detail_barrel", "detail_crate", "detail_crateSmall", "fence", "floor", "floor_flat", "floor_stairs", "floor_stairsCornerInner", "floor_stairsCornerOuter", "floor_steps", "floor_stepsCornerInner", "floor_stepsCornerOuter", "overhang", "overhang_fence", "overhang_round", "roof", "roof_corner", "roof_edge", "structure", "structure_poles", "structure_wall", "tower", "towerPaint", "towerPaint_base", "tower_base", "tower_edge", "tower_top", "wall", "wallFortified", "wallFortifiedPaint", "wallFortifiedPaint_gate", "wallFortifiedPaint_half", "wallFortified_gate", "wallFortified_gateHalf", "wallFortified_half", "wallPaint", "wallPaint_detail", "wallPaint_flat", "wallPaint_gate", "wallPaint_half", "wall_detail", "wall_flat", "wall_flatGate", "wall_gate", "wall_gateHalf", "wall_half", "wall_low" ],
		hex_type : false,
	}
]

var selected_asset_kit = 1

// consider also a set of assets, e.g this one but also another kit from the same artist
// consider the other direction, i.e how a single glTF could become a set of tiles

function displayAllTiles(){
	const scale = 1/10
	let last_type = null
	available_asset_kits[selected_asset_kit].tiles.map( (t) => {
		let x = -1*scale
		if (!last_type) n = 0
		const tiles_types = [ ...available_asset_kits[selected_asset_kit].tiles_types_full, ...available_asset_kits[selected_asset_kit].tiles_types_parts]
		tiles_types.map( (tile_type,ttn) => {
			if (t.indexOf(tile_type) > -1) {
				x = ttn/10 
				if (tile_type != last_type) n = 0
				last_type = tile_type
			}
		} )
		let el = addGltfFromURLAsTarget( available_asset_kits[selected_asset_kit].tile_URL+t+tile_extension, 
			.09,
			""+x+" 0.7 -"+n*scale )
		// fine tuning should also be per asset set
		// el.class = ...
		n++
	} )
	// could consider a new spawner type so that picking a tile clones it first
		// could do same behavior as on release or on picked, namely register listener then act on event
}
// try generating at scale, e.g 2, a landscape to explore based on type
	// with scale adjusting as jxr line to be the Wondering pills/drinks/mushroom to change scale
		// cf similar commands to move a class, consequently could add class after addGltfFromURLAsTarget

function randomTileFull(){
	const tiles_full = available_asset_kits[selected_asset_kit].tiles.filter( t => { let present = false; available_asset_kits[selected_asset_kit].tiles_types_full.map(m => { if (t.indexOf(m)>-1) present = true; }); return present} )
	return tiles_full[Math.floor(Math.random()*tiles_full.length)]
}

var tiles_snapping_grid = []

function getClosestTilesSnappingPosition( t, threshold=0.05 ){
	let point = null
	let found = tiles_snapping_grid.map( i => { return { pos:i, dist: i.distanceTo(t) } } )
		.filter( t => t.dist < threshold )
		.sort( (a,b) => a.dist > b.dist)
	if (found && found[0]) point = found[0].pos
	return point
}

var tile_snapping_enabled = true

AFRAME.registerComponent('snap-on-pinchended', {
	init: function(){
		let el = this.el
		let clone
		this.el.addEventListener('picked', function (event) {
			if (tile_snapping_enabled) {
				clone = el.object3D.clone() // worked with AFrame version but didnt get complex geometry
				AFRAME.scenes[0].object3D.add( clone )
				clone.traverse( c => {
					if (c.type == "Mesh") {
						c.material = c.material.clone()
						c.material.opacity = .5
						c.material.transparent = true
					}
				 } )
			}
		})
		this.el.addEventListener('moved', function (event) {
			if (tile_snapping_enabled) {
				var pos = AFRAME.utils.coordinates.parse( el.getAttribute("position") )
				pos.x = pos.x.toFixed(1) 
				pos.y = pos.y.toFixed(1)
				pos.z = pos.z.toFixed(1)
				clone.position.set(pos.x, pos.y, pos.z)
			}
		})
		this.el.addEventListener('released', function (event) {
			if (tile_snapping_enabled) { // might generalize the name as now used for compound primitives too
				el.setAttribute("rotation", "0 0 0")
				// could limit to an axis or two, e.g here y axis probably should be kept or at least adjust to next 1/6th rotation
				// could snap to invisible grid too, e.g every 1 or 1/10th unit 
				var pos = AFRAME.utils.coordinates.parse( el.getAttribute("position") )
				pos.x = pos.x.toFixed(1) // i.e .1m so 1/10th of a meter here, 10cm
				pos.y = pos.y.toFixed(1)
				pos.z = pos.z.toFixed(1)
				// could check first if that "spot" is "free", e.g not other targets on that position
					// but then if not, what? move to another of the closest 6th closest points? (2 vertical, 2 horizontal, 2 depth) or even 8th with diagonales?
						// if not? now what? move until there is a free spot?
				el.setAttribute("animation__snap"+Date.now(), "property: position; to: "+AFRAME.utils.coordinates.stringify(pos)+"; dur: 200;");
				//el.setAttribute("position", AFRAME.utils.coordinates.stringify(pos))
				//if (clone) clone.remove()
				if (clone) AFRAME.scenes[0].object3D.remove( clone )

				if (el.className == "compound_object"){
					let thresholdDistance = 0.2 // based on object size
					targets.filter( i => (
						(i.className == el.className)
						&& el.getAttribute("position").distanceTo(i.getAttribute("position")) == 0.2)
						&& el.getAttribute("position").y == i.getAttribute("position").y
						&& el.getAttribute("position").z == i.getAttribute("position").z
						).map( _ => document.querySelector("#snapping-sound").components.sound.playSound() )
				} // very restrictive, also doesn't repulse away

			// if works, generalize and add to https://git.benetou.fr/utopiah/text-code-xr-engine/issues/66
			// should come back from emit('released')
			// could rely on getClosestTilesSnappingPosition()
				// if it works, might check if position is not already used by a tile
			}
		})
	}
})

function generateRandomPlace(max_i=10, max_j=10, scale=1/10, y=1.4){
	// lifesize,  y :  -2, scale 1
	// dollhouse, y : 1.4, scale 1/10
	for (let i=0;i<max_i;i++){
		for (let j=0;j<max_j;j++){
			let offset_if_hex = 0
			if (available_asset_kits[selected_asset_kit].hex_type && j%2) offset_if_hex = 1/2
			let pos = new THREE.Vector3( (i+offset_if_hex)*scale, y, (j*8.5/10)*scale )
			el = addGltfFromURLAsTarget( 
				available_asset_kits[selected_asset_kit].tile_URL+randomTileFull()+tile_extension, 
				1*scale, 
				AFRAME.utils.coordinates.stringify( pos )
			)
			el.setAttribute('snap-on-pinchended', '')
			el.className += "tiles"
			tiles_snapping_grid.push( pos )
		}
	}
}

// could add behavior based on class or, maybe easier, add a snapping-after-release component
// it would register an event listener and the released element would trigger an event

function rescalePlace(scale = 10, yoffset=-1){
	let places = Array.from( document.querySelectorAll(".tiles") )
	tiles_snapping_grid = []
	places.map( e => {
		scl = e.getAttribute("scale"); e.setAttribute("scale", scl.x*scale+ " " + scl.y*scale + " " + scl.z*scale)
		pos = e.getAttribute("position"); e.setAttribute("position", pos.x*scale+ " " + (pos.y+yoffset) + " " + pos.z*scale)
		let pos3 = new THREE.Vector3( pos.x*scale, pos.y+yoffset, pos.z*scale )
		tiles_snapping_grid.push( pos3 )
	} )
}

function addScreenshot(){
	screenshotcanvas = document.querySelector('a-scene').components.screenshot.getCanvas('perspective')	
	var sel = document.createElement("a-image") // could use a flat box instead, or use it as a frame
	AFRAME.scenes[0].appendChild(sel) 	
	sel.setAttribute("src", screenshotcanvas.toDataURL() )
	sel.setAttribute("height", .1)
	sel.setAttribute("width", .2)
	sel.setAttribute("position", "0 1.4 -0.1")
	targets.push(sel)
	return sel
}

function newPrimitiveWithOutline( name="box", position="0 0 0", scale=".1 .1 .1" ){
	let el = document.createElement("a-"+name)
	let el_outline = document.createElement("a-"+name)
	el.appendChild(el_outline)
	el.setAttribute("scale", scale)
	el.setAttribute("position", position)
	el_outline.setAttribute("scale", "1.01 1.01 1.01")
	el_outline.setAttribute("color", "gray")
	el_outline.setAttribute("wireframe", "true")
	el_outline.className = "outline_object" 
	return el
}

function addCompoundPrimitiveExample(position="0 1.4 -0.2"){
	let el = generateCompoundPrimitiveExample(position)
	AFRAME.scenes[0].appendChild(el)
	targets.push(el)
	el.setAttribute('snap-on-pinchended', true) // could set the parameter here, e.g sound if close to same type
	return el
}

function addBlockCodeExample(text="hi", pos="0 1.4 -0.2", color="black", outlineColor="white"){
	let el = addNewNote( text )
	el.setAttribute("color", color)
	el.setAttribute("outline-color", outlineColor)
	el.setAttribute("position", pos)
	let compountPrim = generateCompoundPrimitiveExample()
	compountPrim.setAttribute("position", "0.1 0 -0.051")
	el.appendChild(compountPrim)
	// el.setAttribute('snap-on-pinchended', true) 
	return el
}

function generateCompoundPrimitiveExample(position="0 1.4 -0.2"){
	var el = document.createElement("a-entity")	
	el.setAttribute("position", position)
	el.id = "compound_object_" + Date.now()
	el.className = "compound_object" 
	let parts = []
	parts.push( newPrimitiveWithOutline("box",           "0 0 0",     ".2 .1 .1") )
	parts.push( newPrimitiveWithOutline("box",        ".125 0 0",  ".05 .05 .05") )
	parts.push( newPrimitiveWithOutline("box",  "-.125 0.0375 0",  ".05 .025 .1") )
	parts.push( newPrimitiveWithOutline("box", "-.125 -0.0375 0",  ".05 .025 .1") )
	parts.push( newPrimitiveWithOutline("box",  "-.125 0 0.0375", ".05 .05 .025") )
	parts.push( newPrimitiveWithOutline("box", "-.125 0 -0.0375", ".05 .05 .025") )
	parts.map( p => el.appendChild(p) )
	return el
}

function generateCompoundPrimitiveStart(position="0 1.4 -0.2"){
	var el = document.createElement("a-entity")	
	el.setAttribute("position", position)
	el.id = "compound_object_" + Date.now()
	el.className = "compound_object" 
	let parts = []
	parts.push( newPrimitiveWithOutline("box",           "0 0 0",     ".2 .1 .1") )
	parts.push( newPrimitiveWithOutline("box",        ".125 0 0",  ".05 .05 .05") )
	parts.map( p => el.appendChild(p) )
	return el
}

function generateCompoundPrimitiveEnd(position="0 1.4 -0.2"){
	var el = document.createElement("a-entity")	
	el.setAttribute("position", position)
	el.id = "compound_object_" + Date.now()
	el.className = "compound_object" 
	let parts = []
	parts.push( newPrimitiveWithOutline("box",           "0 0 0",     ".2 .1 .1") )
	parts.push( newPrimitiveWithOutline("box",  "-.125 0.0375 0",  ".05 .025 .1") )
	parts.push( newPrimitiveWithOutline("box", "-.125 -0.0375 0",  ".05 .025 .1") )
	parts.push( newPrimitiveWithOutline("box",  "-.125 0 0.0375", ".05 .05 .025") )
	parts.push( newPrimitiveWithOutline("box", "-.125 0 -0.0375", ".05 .05 .025") )
	parts.map( p => el.appendChild(p) )
	return el
}

function addPrimitive( name, position="0 1.4 -0.2" ){
	let el = newPrimitiveWithOutline( name )
	el.setAttribute("position", position)
	AFRAME.scenes[0].appendChild(el)
	el.id = "template_object_" + name
	el.className = "template_object" 
	targets.push(el)
	el.setAttribute('clone-on-primarypinchstarted', true)
	return el
}

AFRAME.registerComponent('clone-on-primarypinchstarted', { 
  init: function () {
	let el = this.el
	this.el.addEventListener('picked', function (event) {
		selectedElement = instanciateFromPrimitive( selectedElement )
	})
  }
})

function instanciateFromPrimitive(element){
	var clone = element.cloneNode(true)
	clone.removeAttribute('clone-on-primarypinchstarted')
	clone.setAttribute( "scale", element.getAttribute("scale") ) // somehow lost?
	clone.id += "_clone" + Date.now()
	clone.className = "cloned"
	targets.push(clone)
	AFRAME.scenes[0].appendChild(clone)
	return clone
}

function addAllPrimitives(){
	const other_primitives = ["camera", "cursor", "sky", "light", "sound", "videosphere"]
	const other_primitives_with_param_needed = ["text", "gltf-model", "obj-model", "troika-text"]
	Object.getOwnPropertyNames(AFRAME.primitives.primitives)
	// thanks to https://github.com/Utopiah/aframe-inVR-blocks-based-editor/blob/master/aframe-invr-inspect.js
		.map( i => i.replace("a-",""))
		.filter( i => other_primitives.indexOf(i) < 0 )
		.filter( i => other_primitives_with_param_needed.indexOf(i) < 0 ) // temporarilty disabled
		.map( (i,j) => addPrimitive( i, ""+ j/7 + " 1.4 -0.5" ) )
}

const eventHighlighterReady = new Event("highlighterready");
var highlighter
shiki.setCDN(jxrrootURL+'engine/'+'../content/shiki/') // see https://github.com/shikijs/shiki#specify-a-custom-root-directory
shiki.getHighlighter({ theme: 'monokai', langs: ['javascript' ] }).then(h => { highlighter = h; document.body.dispatchEvent(eventHighlighterReady); } )
	// see https://github.com/shikijs/shiki/blob/main/docs/languages.md 

function highlight(code = `console.log("Here is your code."); var x = 5;`, language='javascript'){
	if (!highlighter) return null
	// check set colorRange if the result is {} which is the case when shiki highlighter isn't ready or available
	const tokens = highlighter.codeToThemedTokens(code, language)
	let pos=0
	let colorRange={}
	tokens.map( line => {
		line.map( (t,i) => {
			colorRange[pos] = t.color/*.replace("#","0x")*/
			pos+=t.content.length
		})
		pos++
	})
	return colorRange
}

function startExperience(){
	//fetch("https://fabien.benetou.fr/Tools/Docker?action=source").then(r=>r.text()).then( page => { addCodeEditor( page, "" ) })
        //if (AFRAME.utils.device.checkHeadsetConnected()) AFRAME.scenes[0].enterVR();
	//document.querySelector("#snapping-sound").components.sound.playSound();
	document.querySelector("#mainbutton").style.display = "none"
}

// track created editors then apply actions to the currently selected one
// problems happen when relying on querySelector/getElementById rather than a specific editor
	// do these based on codeEditor.element rather than document	
// still probably problematic for interactions
	// consider for now only the currentEditor

function nextLineCodeEditor(codeEditor, lines=1){ // can be negative to scroll up
	if (codeEditor.line+lines < 0) return
	codeEditor.line+=lines
	let content=codeEditor.page.split("\n").slice(codeEditor.line,codeEditor.line+codeEditor.lengthWindowRange).join("\n"); 
	codeEditor.currentlyDisplayedText=content
	codeEditor.element.setAttribute("troika-text", {value: content})
	if (codeEditor.language) codeEditor.element.setAttribute("troika-text", {colorRanges: highlight(content, language='javascript')})
	let gutterEl = codeEditor.element.querySelector(".leftgutter")
	if (gutterEl){
		let lineNumbers = "\n"
		for (let i=codeEditor.line+1;i<=codeEditor.line+codeEditor.lengthWindowRange;i++){
			for (let pad=0;pad<String(getNumberOfLinesFromCodeEditor()).length-String(i).length; pad++)
				lineNumbers+="_"
			lineNumbers+=i+"\n"
		}
		gutterEl.setAttribute("troika-text", {value: lineNumbers})
	}

	let rightGutterEl = codeEditor.element.querySelector(".rightgutter")
	if (rightGutterEl){
		b = rightGutterEl.parentElement.object3D.children[0]._textRenderInfo.blockBounds
		w = b[2]-b[0]
		h = b[3]-b[1]
		let scrollBarHeight = codeEditor.lengthWindowRange/codeEditor.page.match(/\n/g).length * h
		let scrollBarVerticalOffset = codeEditor.line/codeEditor.page.match(/\n/g).length * h
		if (scrollBarHeight < .1) scrollBarHeight = .1
		rightGutterEl.object3D.position.y= h/2-scrollBarHeight/2 - scrollBarVerticalOffset
	}
}

function nextPageCodeEditor(codeEditor){
	nextLineCodeEditor(codeEditor, codeEditor.lengthWindowRange)
}

function previousPageCodeEditor(codeEditor){
	nextLineCodeEditor(codeEditor, -codeEditor.lengthWindowRange)
}

function stopScrollCodeEditor(codeEditor){
	codeEditor.scrollInterval = clearInterval( codeEditor.scrollInterval )
}

function startScrollCodeEditor(codeEditor){
	if (!codeEditor.scrollInterval) codeEditor.scrollInterval = setInterval( _ => nextLineCodeEditor(codeEditor), 100)
}

function highlightAllOccurences(codeEditor, keyword="function"){
	let indices = []
	let lastfound = codeEditor.currentlyDisplayedText.indexOf(keyword,0)
	while (lastfound>-1) {
		indices.push(lastfound)
		lastfound = codeEditor.currentlyDisplayedText.indexOf(keyword,lastfound+keyword.length)
	}
	indices.map( pos => {
		let offset = (codeEditor.currentlyDisplayedText.slice(0,pos).match(/[\n\t ]/g)||[]).length
		pos-=offset
		highlightString(pos, keyword.length)
	})
}

function hightlightNextKeyword(codeEditor, keyword="function"){
	let pos = codeEditor.currentlyDisplayedText.indexOf(keyword)
	// invisible characters... some still left
	let offset = (codeEditor.currentlyDisplayedText.slice(0,pos).match(/[\n\t ]/g)||[]).length
	pos-=offset
	highlightString(pos, keyword.length)
}

function highlightString(codeEditor, pos, length){
	for (let c=pos;c<pos+length;c++) highlightChar(codeEditor,  c )
}

// WARNING this is limited to visible characters, i.e not " " or "\t" or "\n"
// should instead allow to highlight " " and "\t" both looking the same
function highlightChar(codeEditor, pos=0, name=null){ // could have multiple selection
	let b = Array.from( codeEditor.element.object3D.children[0].geometry.attributes.aTroikaGlyphBounds.array ).slice(pos*4,pos*4+4)
	let w = b[2]-b[0]
	let h = b[3]-b[1] // could be used to check for same line, if so could make a single block from beginning to end

	let g = new THREE.BoxGeometry( w, h, .01  );
	let m = new THREE.MeshBasicMaterial( {color: 0xffffff, opacity: 0.8, transparent: true} );
	let c = new THREE.Mesh( g, m )
	if (name) c.name = name
	codeEditor.element.object3D.add( c );  

	c.position.x= b[0]+w/2
	c.position.y= b[1]+h/2
	c.position.z= .01
}

function highlightUnderChar(codeEditor, pos=0, name=null){
	let b = Array.from( codeEditor.element.object3D.children[0].geometry.attributes.aTroikaGlyphBounds.array ).slice(pos*4,pos*4+4)
	// note that this skips invisible char and thus desync codeEditor.caret from actual position
		// but, for now at least, " " and "\t" seems to be of equal value and "\n" does not shift on the current line
		// currently we could count the invisible moving ones on this line and negative offset horizontally
	let currentLineNumber = (codeEditor.currentlyDisplayedText.slice(0, pos ).match(/\n/g)||[]).length
	let currentPositionOnLine = codeEditor.currentlyDisplayedText.slice(0, pos ).length
		- codeEditor.currentlyDisplayedText.split("\n").slice(0,currentLineNumber).join("\n").length
	console.log(currentPositionOnLine)
// might need a special case for the beginning of the line... or rather maybe the position here is different, it's the number of the glyph
// e.g "   x" x is not 3 but 0
// we could also count then from the string but we don't have that, just pos as parameter. Some extra information might be needed.

	let currentLineContent = codeEditor.currentlyDisplayedText.split("\n")[currentLineNumber].slice(0, currentPositionOnLine)
	let invisibleOnCurrentLine = (currentLineContent.slice(0, currentPositionOnLine).match(/[\t ]/g)||[]).length
	const spaceSize = .046 // hardcoded but changes per front so should be measured instead
		// can be done via temptroikaobject.element.object3D.children[0].geometry.attributes.aTroikaGlyphBounds.array[0] for value " _"
			// as a kind of calibration
	let w = b[2]-b[0]
	let h = b[3]-b[1] // could be used to check for same line, if so could make a single block from beginning to end
//console.log(invisibleOnCurrentLine, currentLineContent)

	let g = new THREE.BoxGeometry( w, .01, .01  );
	let m = new THREE.MeshBasicMaterial( {color: 0xffffff, opacity: 0.8, transparent: true} );
	let c = new THREE.Mesh( g, m )
	if (name) c.name = name
	codeEditor.element.object3D.add( c );

	c.position.x= b[0]+w/2-invisibleOnCurrentLine*spaceSize
	c.position.y= b[1]-.01
	c.position.z= .01
}

function moveCaretToNextVisibleChar(codeEditor){
	addCaretToCodeEditor( ++codeEditor.caret )
	// might be able to reach non visible one by remove an offset
}

function addCaretToCodeEditor(codeEditor, pos=0){
	if (codeEditor.caret) removeCaretFromCodeEditor(codeEditor)
	highlightUnderChar(codeEditor, pos, "caret")
	codeEditor.caret = pos
}

function removeCaretFromCodeEditor(codeEditor){
	codeEditor.element.object3D.getObjectByName("caret").removeFromParent()
}

function clearCodeEditorContent(codeEditor){
	updateCodeEditorWithContent( "" )
}

// should support a range, note the entire document (or window?)
function searchAndReplaceInCodeEditor(codeEditor, before, after){
	updateCodeEditorWithContent( codeEditor, codeEditor.currentlyDisplayedText.replaceAll(before, after))
	// note that it desyncs from page so page should only be seen as the initial source
		// this though would break scrolling which is based on page
		// consequently page should be modified
}

function updateCodeEditorWithContent(codeEditor, content){
	if (!codeEditor.element) return
	codeEditor.currentlyDisplayedText=content
	codeEditor.element.setAttribute("troika-text", {value: content})
	if (codeEditor.language) codeEditor.element.setAttribute("troika-text", {colorRanges: highlight(content, codeEditor.language)})
}

function addBackdropToTroikaElement( codeEditor ){
	let el = codeEditor.element
	el.addEventListener("object3dset", e => {
		el.object3D.children[0].addEventListener("synccomplete", e => {
			// this can be used for resizing but without add the element
			if (codeEditor.element.querySelector(".leftgutter")) return // already added, should unregister

			b = el.object3D.children[0]._textRenderInfo.blockBounds
			w = b[2]-b[0]
			h = b[3]-b[1]

			g = new THREE.BoxGeometry( w, h, .01  );
			m = new THREE.MeshBasicMaterial( {color: 0, opacity: 0.9, transparent: true} );
			c = new THREE.Mesh( g, m );
			el.object3D.add( c );  
			c.name = "backdrop"
			c.position.z=-.01
			c.position.x= w/2
		})
	})
}

function addGuttersToTroikaElement( codeEditor ){
	let el = codeEditor.element
	el.addEventListener("object3dset", e => {
		el.object3D.children[0].addEventListener("synccomplete", e => {
			if (codeEditor.element.querySelector(".leftgutter")) return 
			// already added, should unregister, can be removed to allow dynamic resizing BUT should skip adding element
	
			b = el.object3D.children[0]._textRenderInfo.blockBounds
			w = b[2]-b[0]
			h = b[3]-b[1]

			gutterWidth = .2 * String(getNumberOfLinesFromCodeEditor(codeEditor)).length
			//should adjust width based on number of lines in total first
			g = new THREE.BoxGeometry( gutterWidth, h, .01  );
			m = new THREE.MeshBasicMaterial( {color: 0x333333, opacity: 0.9, transparent: true} );
			c = new THREE.Mesh( g, m );
			el.object3D.add( c );  
			c.position.z=-.01
			c.position.x= -gutterWidth/2
			//c.rotation.y= .2 // looks nice but have to consider text on top first, could apply rotation to text too
			var leftGutter = document.createElement("a-troika-text")
			leftGutter.setAttribute("anchor", "left" )
			leftGutter.setAttribute("outline-width", "5%" )
			leftGutter.setAttribute("outline-color", "black" )
			let lineNumbers = "\n"
			for (let i=codeEditor.line+1;i<=codeEditor.line+codeEditor.lengthWindowRange;i++){
				for (let pad=0;pad<String(getNumberOfLinesFromCodeEditor(codeEditor)).length-String(i).length; pad++)
					lineNumbers+="_" // not using a fixed width font now so " " is smaller
				lineNumbers+=i+"\n"
			}
			lineNumbers.slice(0,-1)
			leftGutter.setAttribute("troika-text", {value: lineNumbers})
			leftGutter.setAttribute("troika-text", {textIndent: -.5})
			leftGutter.className = "leftgutter"
			codeEditor.element.appendChild( leftGutter )
			// should be updated when scrolling
	
			gutterWidth = .1
			g = new THREE.BoxGeometry( gutterWidth, h, .01  );
			m = new THREE.MeshBasicMaterial( {color: 0x333333, opacity: 0.9, transparent: true} );
			c = new THREE.Mesh( g, m );
			el.object3D.add( c );  
			c.position.z=-.01
			c.position.x= w+gutterWidth/2
			//c.rotation.y= -.2 // looks nice but have to consider text on top first
	
			var rightGutter = document.createElement("a-cylinder")
			// height proportional to the visible content to the terminal size
			let scrollBarHeight = codeEditor.lengthWindowRange/getNumberOfLinesFromCodeEditor(codeEditor) * h
			let scrollBarVerticalOffset = codeEditor.line/getNumberOfLinesFromCodeEditor(codeEditor) * h
			if (scrollBarHeight < .1) scrollBarHeight = .1
			rightGutter.setAttribute("height", scrollBarHeight )
			rightGutter.setAttribute("radius", .01 )
			rightGutter.className = "rightgutter"
			// should become a constrained target (moving only on y axis and clamped)
			codeEditor.element.appendChild( rightGutter )
			// so... rightgutter vs rightGutter ... somehow changing to the "correct" one breaks the editor itself (?!)
			rightGutter.object3D.position.x= w+gutterWidth/2
			rightGutter.object3D.position.y= h/2-scrollBarHeight/2 - scrollBarVerticalOffset
			// offset by line position proportional also then updated when scrolling
			
			gutterHeight = .3
			g = new THREE.BoxGeometry( w, gutterHeight, .01  );
			m = new THREE.MeshBasicMaterial( {color: 0x333333, opacity: 0.9, transparent: true} );
			c = new THREE.Mesh( g, m );
			el.object3D.add( c );  
			c.position.z=-.01
			c.position.y= -h/2-gutterHeight/2
			c.position.x= w/2
			//c.rotation.x= -.2 // looks nice but have to consider text on top first
			// should add the commands here
			var middleGutter = document.createElement("a-troika-text")
			middleGutter.setAttribute("anchor", "left" )
			middleGutter.setAttribute("outline-width", "5%" )
			middleGutter.setAttribute("outline-color", "black" )
			middleGutter.setAttribute("troika-text", {value: ":(will add commands here)"})
			//middleGutter.setAttribute("troika-text", {textIndent: -.3})
			middleGutter.className = "middlegutter"
			codeEditor.element.appendChild( middleGutter )
			middleGutter.object3D.position.y= -h/2-gutterHeight/2
			// should disable the overlay first, see parseKeys
				// see listeners in 'hud'
			let enteringCommand = false
			document.addEventListener('keydown', function(event) {
				if (keyboardInputTarget != 'codeeditor') return
				if (event.key == ":"){
					enteringCommand = true
					//let middlegutter = document.getElementById("middlegutter")
					middleGutter.setAttribute("troika-text", {value: ":(started typing command)"})
					// should add text here until esc or enter is pressed
				} else if (enteringCommand) {
					if (event.key == "Escape"){
						enteringCommand = false
						middleGutter.setAttribute("troika-text", {value: "(cancel, ready to receive new command)"})
					} else if (event.key == "Enter"){
						enteringCommand = false
						middleGutter.setAttribute("troika-text", {value: "(executed, ready to receive new command)"})
						// could rely only on searchAndReplaceInCodeEditor(before, after) for now
							// which BTW should support a range, note the entire document (or window?)
					} else {
						middleGutter.setAttribute("troika-text", {value: 
							middleGutter.getAttribute("troika-text").value
							+ event.key})
					}
				}
			});
		})
	})
}

function getNumberOfLinesFromCodeEditor(codeEditor){
	let newLines = codeEditor.page.match(/\n/g)
	if (!newLines) return 1 // undefined or 0
	return newLines.length+1
}

function getEditorFromId( id ){
	return editors.filter(e=>e.element.id.includes(id))?.[0]
}

// add jxr command on top of the editor e.g "jxr focusCodeEditor()" which would replace keyboard input
	// switching keyboardInputTarget to 'codeeditor' then to 'hud' when done
	// should also support clipboard or even a more direct way to have impact
	// could save remotely (e.g wiki) or locally in localStorage
function addCodeEditor(page="jxr console.log('hello world')", language="javascript",
	position="-.5 1.6 -.7", name="codeditor", width=50, preventReflow=false ){
	let codeEditor = {
		element: null,
		line: 0,
		page: null,
		startWindowRange: 0,
		lengthWindowRange: 20,
		scrollInterval: null,
		currentlyDisplayedText: "",
		caret: null,
		language: ''
	}
	// could also add empty but with column and row for sizing

	let forcedLines = ''
	let pos = 0
	let content = page
	let line = ''
	let parts =  page.split(' ')
	let n = 0

	if (!preventReflow && !language.length){
		while ( pos < page.length ){
			while ( line.length < width && parts[n]){
				line += parts[n++] + ' '
			}
			let potentialine = content.slice(pos, pos+width)
			forcedLines += line.trim() + '\n'
			pos+=line.length
			if (line.length==0) pos++
			line = ''
		}

		codeEditor.page = forcedLines
	} else {
		codeEditor.page = page
	}
	codeEditor.line = codeEditor.startWindowRange
	let numberOfLines = getNumberOfLinesFromCodeEditor(codeEditor)
	if (numberOfLines<codeEditor.lengthWindowRange) codeEditor.lengthWindowRange = numberOfLines

	content=codeEditor.page.split("\n").slice(codeEditor.line,codeEditor.line+codeEditor.lengthWindowRange).join("\n"); 
	codeEditor.currentlyDisplayedText=content

	if (document.getElementById(name)) name += Date.now()  
	// shouldn't exist prior
	if (!codeEditor.element) codeEditor.element = addNewNote(content, position, "0.1 0.1 0.1", name, "tool")
	codeEditor.element.classList.add('reader')
	codeEditor.element.setAttribute("troika-text", {value: content})
	codeEditor.element.setAttribute("troika-text", {depthOffset: .1})
	codeEditor.element.setAttribute("rotation", "30 0 0")
	if (language.length && language != "none") {
		codeEditor.element.setAttribute("troika-text", {colorRanges: highlight(content, language)})
		codeEditor.language = language
	}

	addBackdropToTroikaElement( codeEditor)
	addGuttersToTroikaElement( codeEditor)
	
	let scrollbarPicked = false
	let previousPosition
	let p = document.querySelector('[pinchprimary]')
	let target = new THREE.Vector3(); // create once an reuse it
	p.addEventListener('pinchended', pinchPrimaryScrollbarEnded );
	function pinchPrimaryScrollbarEnded(event){
		//p.removeEventListener('pinchended', pinchPrimaryScrollbarEnded)
		//p.removeEventListener('pinchmoved', pinchPrimaryScrollbarMoved)
		//p.removeEventListener('pinchstarted', pinchPrimaryScrollbarStarted)
		if (!scrollbarPicked) return
		scrollbarPicked = false
	}
	p.addEventListener('pinchmoved', pinchPrimaryScrollbarMoved );
	function pinchPrimaryScrollbarMoved(event){
		if (!scrollbarPicked) return
		if (previousPosition.y>event.detail.position.y)
			nextLineCodeEditor(1)
		else
			nextLineCodeEditor(-1)
		previousPosition = event.detail.position.clone()
	}
	p.addEventListener('pinchstarted', pinchPrimaryScrollbarStarted );
	function pinchPrimaryScrollbarStarted(event){
		let rightGutterEl = codeEditor.element.querySelector(".rightgutter")
		previousPosition = event.detail.position.clone()
		rightGutterEl.object3D.getWorldPosition( target );
		if (previousPosition.distanceTo(target)<0.1) scrollbarPicked = true
	}
	
	editors.push( codeEditor )
	return codeEditor
}

function addCodeMultipleEditors(parts, src, language, name='splitededitor'){
	let editorParts = []
	let pl = src.length/parts
	for (let n=0; n<parts; n++ ){
		editorParts.push( 
			addCodeEditor( src.slice(n*pl,(n+1)*pl), language, '-0.22 '+(2-n/10)+' -.4', name+'_part'+n )
		)
	}
	return editorParts
}

function mergeEditors( editors ){
	// inherit language and content from the last found
	let pos = ''
	let content = ''
	let language = ''
	editors.reverse().map( e => {
		content += e.page // could add separator, e.g new line
		if (language != e.language) console.warn('different language in editors to merge')
		language = e.language
		pos = e.element.getAttribute("position").clone()
		e.element.setAttribute("visible", false)
	})
	return addCodeEditor( content, language, AFRAME.utils.coordinates.stringify( pos ), "codeditormerge", editorBaseWidth, true )
}

// should reconsider the behavior as the content could still be the same but what is displayed changed
function splitEditorHorizontally( codeEditor, preventReflow=true){
	let p1, p2
	if (codeEditor.language.length){
		let content = codeEditor.page.split('\n')
		p1 = content.slice(content.length/2).join('\n')
		p2 = content.slice(0,content.length/2).join('\n')
	} else {
		p1 = codeEditor.page.slice(codeEditor.page.length/2)
		p2 = codeEditor.page.slice(0,codeEditor.page.length/2)
	}
	let pos1 = codeEditor.element.getAttribute("position").clone()
	let pos2 = codeEditor.element.getAttribute("position").clone()
	//pos1.x-=1
	//pos2.x+=1
	pos1.y-=.1
	pos2.y+=.1
	// could also be set based on controllers/hands positions at the end of a stretch/pull gesture
	let ce1 = addCodeEditor( p1, codeEditor.language, AFRAME.utils.coordinates.stringify( pos1 ), "codeditorsplit", editorBaseWidth, preventReflow)
	let ce2 = addCodeEditor( p2, codeEditor.language, AFRAME.utils.coordinates.stringify( pos2 ), "codeditorsplit", editorBaseWidth, preventReflow )
		//codeEditor.language, codeEditor.element.getAttribute("position"), "codeditorsplit" )
	// should be smaller yet somehow displays it all
	//updateCodeEditorWithContent(codeEditor, p2 )
	return [ce1, ce2]
}

// could change model opacity based on hand position, fading out when within a (very small here) safe space

function removeOutlineFromEntity( el ){
	[...el.querySelectorAll(".outline_object")].map( i => i.remove() )
}

function getIdFromPick(){
	let id = null
	let pp = selectedElements.filter( e => e.primary )
	if (pp && pp[pp.length-1] && pp[pp.length-1].element ){
		if (!pp[pp.length-1].element.id) pp[pp.length-1].element.id= "missingid_"+Date.now() 
		id = pp[pp.length-1].element.id
		setFeedbackHUD(id)
	}
	return id
}

function getClassFromPick(){ // should be classes, for now assuming one
	let classFound = null
	let pp = selectedElements.filter( e => e.primary )
	if (pp && pp[pp.length-1] && pp[pp.length-1].element ){
		//if (!pp[pp.length-1].element.className) pp[pp.length-1].element.className= "missingclass"
		// arguable
		classFound = pp[pp.length-1].element.className
		setFeedbackHUD(classFound)
	}
	return classFound
}

function getArrayFromClass(classname){
	return Array.from( document.querySelectorAll("."+classname) )
}

function applyToClass(classname, callback, value){
// example applyToClass("template_object", (e, val ) => e.setAttribute("scale", val), ".1 .1 .2")
	getArrayFromClass(classname).map( e =>  callback(e, value))
// could instead become a jxr shortcut, namely apply a set attribute to a class of entities
}

function changeColorLastClass(){
	let classFound = getClassFromPick() // applies on primary only
	if (classFound) 
		[...document.querySelectorAll("."+classFound)].map( el => el.setAttribute("color", "red") )
}

function changeColorLastId(){
	let id = getIdFromPick() // applies on primary only
	if (id) document.querySelector("#"+id).setAttribute("color", "red")
}

function changeColorNextPinch(){
	//let id = getIdFromPick() // applies on primary only
		// does not work anymore ... but could listen to selectedElements changes via an observer but deprecated
		// proxy could be nice but requires to modify push() calls first
	let lastPrimary = selectedElements.filter( e => e.primary ).length

	let checkForNewPinches = setInterval( _ => {
		if (selectedElements.filter( e => e.primary ).length > lastPrimary){
			let id = getIdFromPick() // applies on primary only
			if (id) document.querySelector("#"+id).setAttribute("color", "red")
			clearInterval(checkForNewPinches)
		}
	}, 50) // relatively cheap check, filtering on small array
}

// see demo ~30min in during https://www.youtube.com/watch?v=X9bQ-6oWKc4
// should link to the right code already written
	// see also cloneAndDistribute() & observe() but there is another one... between pinches
		// observe being a shortcut to bindVariableValueToNewNote(variableName)
let pointsFromMovement = []
function nextMovementToPoints(debut=false){
	pointsFromMovement = [] // could also add them to a larger array with timestamps
	let el = document.querySelector('[pinchprimary]')
	el.addEventListener('pinchended', function addThenRemove(event) { 
		addPointToPointsFromMovement(event)
		// could add a timeout so that if no pinchended happens after e.g 10sec one doesn't forget
		el.removeEventListener('pinchended', addThenRemove)
		el.removeEventListener('pinchstarted', addPointToPointsFromMovement)
		el.removeEventListener('pinchmoved', addPointToPointsFromMovement)
	});
	el.addEventListener('pinchmoved', addPointToPointsFromMovement );
	el.addEventListener('pinchstarted', addPointToPointsFromMovement );
	function addPointToPointsFromMovement( event){
		pointsFromMovement.push( event.detail.position.clone() )
	}

/*
could be a promise also

//see examples for debugging/dev 
testPoints = await fetch("pointsFromMovementExample.json").then( r => r.json() )

//could also otherwise down sample
let first = new THREE.Vector3(  ).copy( testPoints[0] )
let last = new THREE.Vector3(  ).copy( testPoints[testPoints.length-1]) 
let distance = first.distanceTo( last )
let direction = new THREE.Vector3().subVectors( last, first ).normalize()

//example of adding on curve
testPoints.map( p => addNewNote("something "+Math.random(), p) )

//example of animating from start to end
nn = addNewNote("something", testPoints[0]);
nn.setAttribute("animation", {property: "position" , to: AFRAME.utils.coordinates.stringify(testPoints[testPoints.length-1]) } )
*/
}

function addDropZone(position="0 1.4 -0.6", callback=setFeedbackHUD, radius=0.11){
// consider how this behavior could be similar to the wrist watch shortcut
// namely binding it to a jxr function
	let el = document.createElement("a-sphere")
	el.setAttribute("wireframe", true)
	el.setAttribute("radius", radius)
	el.setAttribute("position", position)
	el.id = "dropzone_"+Date.now()
	AFRAME.scenes[0].appendChild( el )
	let sphere = new THREE.Sphere( AFRAME.utils.coordinates.parse( position ), radius )
	// could become movable but would then need to move the matching sphere too
		// could be a child of that entity
	let pincher = document.querySelector('[pinchprimary]')
	pincher.addEventListener('pinchended', function (event) { 
		if (selectedElements.length){
			let lastDrop = selectedElements[selectedElements.length-1]
			if ((Date.now() - lastDrop.timestamp) < 1000){
				if (sphere.containsPoint( lastDrop.element.getAttribute("position"))){
					// should be a threejs sphere proper, not a mesh
					console.log("called back" )
					callback( lastDrop.selectedElement )
				}
			}
		}
	})
	// never unregister
	return el
}

/*

generalize selector to pick last Nth rather than very last
        adapt getIdFromPick() with .slice() after filter then map on length-N instead of length-1

selector pickers : pickClass and pickId
        display result in 3D HUD with rotating objects and selector value
                ideally themselves also selectable/usable, e.g clone from HUD to bring back "out"
                         requires extra work as becoming a child will not work, own positionning
                                should fix that
                        could compare to world coordinates instead of "just" position attribute
        add a clear selector function to avoid making the HUD unusable

could also pick via volume, e.g wireframe box
        start with https://threejs.org/docs/#api/en/math/Box3.containsPoint
                can iterate with https://threejs.org/docs/#api/en/math/Box3.containsBox
                consider also https://threejs.org/docs/#api/en/math/Box3.intersectsBox

consider pick then apply, i.e changeColorLastId() but for next Id
        should be cancealable

*/

function addGrid(){ // not actually correct but does the job
	plot = document.createElement("a-entity")
	var idx = 0
	for (var x=-5;x<=5;x++)
		for (var y=0;y<=3;y++)
			for (var z=-5;z<=5;z++){
				xp=-x
				yp=-y
				zp=-z
				plot.setAttribute("line__"+ ++idx, `start: ${x} ${y} ${z}; end : ${xp} ${y} ${z}; opacity: 1;`)
				plot.setAttribute("line__"+ ++idx, `start: ${x} ${y} ${z}; end : ${x} ${yp} ${z}; opacity: 1;`)
				plot.setAttribute("line__"+ ++idx, `start: ${x} ${y} ${z}; end : ${x} ${y} ${zp}; opacity: 1;`)
			}
	plot.id = "grid"
	AFRAME.scenes[0].appendChild( plot )
}

// functions call by event listener should be within this scope
// thus hopefully not conflicting with other listeners
function emptyPinchToMove(){
	const startRadius = .00001
	const maxRadius = .1
	const maxDist = .05
	const resetPosition = "0 9999 0"
	let previousPosition
	let controlSphere = document.createElement("a-sphere")
	let r = startRadius 
	controlSphere.setAttribute("radius", r) 
	controlSphere.setAttribute("color", "blue")
	controlSphere.setAttribute("wireframe", "true")
	controlSphere.setAttribute("position", resetPosition)
	AFRAME.scenes[0].appendChild( controlSphere )
	//targets.push(controlSphere) // keeping it out for specific control for now but should consider generalization
        let el = document.querySelector('[pinchprimary]')
        el.addEventListener('pinchended', function end(event) {
		// el.removeEventListener('pinchended', end)
		// el.removeEventListener('pinchstarted', pinched)
		// el.removeEventListener('pinchmoved', moved)
		r = startRadius
		controlSphere.setAttribute("radius", r) 
		controlSphere.setAttribute("position", resetPosition)
        })
        el.addEventListener('pinchmoved', moved );
        function moved(event){
		if (selectedElement) return
		controlSphere.setAttribute("position", AFRAME.utils.coordinates.stringify( event.detail.position) )
		if (r >= maxDist){
			// start be movable after .05 diam
			if (previousPosition){
				diff = previousPosition.sub(event.detail.position).clone()
				pushBackClass("hidableenvironment", diff.z*10) // consider something exponential instead while maintaining sign
				pushLeftClass("hidableenvironment", diff.x*10)
				// could rely on getArrayFromClass(classname) to then move on these 2 dimensions
			}
		} 
		if (r < maxRadius) {
			r += 0.01
			controlSphere.setAttribute("radius", r) 
		}
		previousPosition = event.detail.position.clone()
        }
        el.addEventListener('pinchstarted', pinched );
        function pinched(event){
        }

	let previousPositionSecondary
        let elSecondary = document.querySelector('[pinchsecondary]')
        elSecondary.addEventListener('pinchmoved', movedSecondary );
        function movedSecondary(event){
		if (selectedElement) return
		if (previousPositionSecondary){
			angle = previousPositionSecondary.sub(event.detail.position).clone()
			let axis = new THREE.Vector3( 0, 1, 0 );
			applyToClass("hidableenvironment", (e, val ) => {
				//let rot = e.getAttribute("rotation")
				//e.setAttribute("rotation", ""+rot.x+" "+(rot.y+val*90)+" "+rot.z)
				// rotating from the center of the model, not the player position
let obj = e.object3D
obj.position.sub(val.point)
obj.position.applyAxisAngle( axis, val.angle ) // no offset but reset when pinching again
//obj.position.applyAxisAngle( axis, obj.rotation.y+val.angle ) // rotates with offset
obj.position.add(val.point)
obj.rotateOnAxis(axis, val.angle)
// cf https://stackoverflow.com/questions/42812861/three-js-pivot-point/42866733#42866733
// does reset on each new pinch though

// might be a threejs vs AFrame rotation setup?
			}, {angle:angle.x, point:event.detail.position.clone()})
		}
		previousPositionSecondary = event.detail.position.clone()
        }
}

AFRAME.registerComponent('refresh-text-content-from-wiki-page', {
	schema: {
		pagename: {type: 'string', default: 'FoT'},
	},
	init:function(){
		this.added = []
		let = forcedPagename = AFRAME.utils.getUrlParameter('roomname')
		forcedPagename?this.pagename=forcedPagename:this.pagename=this.data.pagename
		this.tick = AFRAME.utils.throttleTick(this.tick, 500, this);
	},
	tick: function(){
		let generatorName = this.attrName
		fetch("https://fabien.benetou.fr/PIMVRdata/"+ this.pagename +"?action=source#" + Date.now()).then(res => res.text() ).then(res => {
			res.split("\n").slice(0,maxItemsFromSources).map( (n,i) => {
				found = this.added.find((str) => str === n)
				if (typeof found === 'undefined'){
					this.added.push(n)
					addNewNote( n, "-1 "+(1+i/10)+" -2.5", ".1 .1 .1", null, generatorName ) 
				}
			})
		})
	}
});

function sendPerspectiveToServer(){
	let pagename
	let = forcedPagename = AFRAME.utils.getUrlParameter('roomname')
	forcedPagename?pagename=forcedPagename:pagename="TestingPairCollaboration"
	document.querySelector('a-scene').components.screenshot.getCanvas('perspective').toBlob( blob => { 
	  let img = new File([blob], pagename+".jpg", { type: "image/jpeg"});

	  form = new FormData();
	  form.append('authpw', 'upload_pass_for_api');
	  form.append('n', 'PIMVRdata.TestFormUpoad');
	  form.append('action', 'postupload');
	  form.append('uploadfile', img);

	  fetch('https://fabien.benetou.fr/PIMVRdata/TestFormUpoad', {
	    method: 'POST',
	    body: form
	  });
	}, "image/jpeg", 0.8);
}

function doublePinchToScale(){
	let initialPositionSecondary
	let initialScale
        let elSecondary = document.querySelector('[pinchsecondary]')
        elSecondary.addEventListener('pinchmoved', movedSecondary );
        function movedSecondary(event){
		if (!selectedElement) return
		let scale = initialScale * initialPositionSecondary.distanceTo(event.detail.position) * 50
		selectedElement.setAttribute("scale", ""+scale+" "+scale+" "+scale+" ")
        }
        elSecondary.addEventListener('pinchstarted', startedSecondary );
        function startedSecondary(event){
		initialPositionSecondary = event.detail.position.clone()
		if (!selectedElement) return
		initialScale = AFRAME.utils.coordinates.parse( selectedElement.getAttribute("scale") ).x
        }
}

function makeAnchorsVisibleOnTargets(){
	targets.map( t => {
		let controlSphere = document.createElement("a-sphere")
		controlSphere.setAttribute("radius", 0.05) 
		controlSphere.setAttribute("color", "blue")
		controlSphere.setAttribute("wireframe", "true")
		controlSphere.setAttribute("segments-width", 8)
		controlSphere.setAttribute("segments-height", 8)
		t.appendChild( controlSphere )
	}) // could provide a proxy to be able to monitor efficiently
}

function startMesher(){
// consider preview triangle from primary moved
	let meshPoints = []
	let meshTriangles = []
	let offset
	let meshEl = document.createElement("a-entity")
	meshEl.className += "meshed"
	AFRAME.scenes[0].appendChild( meshEl )

        let elSecondary = document.querySelector('[pinchsecondary]')
        elSecondary.addEventListener('pinchended', endedSecondary );
	function endedSecondary(){
		targets.push(meshEl)
		meshEl.setAttribute('dynamic-body', "shape:hull")
		// using 'dynamic-unless-picked' crashes the browser
		//makeAnchorsVisibleOnTargets() // too large here
		applyToClass("meshvertex", (e, val ) => e.setAttribute("visible", val), "false")
		el.removeEventListener('pinchended', end)
		elSecondary.removeEventListener('pinchended', endedSecondary );
	}

        let el = document.querySelector('[pinchprimary]')
        el.addEventListener('pinchended', end)

	function end(event) {
		if (selectedElement) return
		let pos = event.detail.position.clone()
		if (meshPoints.length==0){
			meshOffset = event.detail.position.clone()
			meshEl.getAttribute("position").add(meshOffset)
		}
		let currentPos = AFRAME.utils.coordinates.stringify( pos.sub(meshOffset) )
		let controlSphere = document.createElement("a-sphere")
		controlSphere.className += "meshvertex"
		controlSphere.setAttribute("radius", 0.01) 
		controlSphere.setAttribute("color", "green")
		controlSphere.setAttribute("wireframe", "true")
		controlSphere.setAttribute("segments-width", 8)
		controlSphere.setAttribute("segments-height", 8)
		controlSphere.setAttribute("position", currentPos)
		meshEl.appendChild( controlSphere )
		meshPoints.push(controlSphere)
		if (meshPoints.length==2){
			let previousPos = AFRAME.utils.coordinates.stringify( 
				meshPoints[meshPoints.length-2].getAttribute("position") )
			meshEl.setAttribute("line", `start: ${previousPos}; end : ${currentPos}; opacity: 1; color:white;`)
		}
		if (meshPoints.length>2){
			meshEl.removeAttribute("line")
			let ranked = meshPoints
				.slice(0,-1)
				.map( t => { return { el: t, dist : pos.distanceTo(t.getAttribute("position") ) } })
				.sort( (a,b) => a.dist - b.dist)
			let triangle = document.createElement("a-triangle")
			triangle.setAttribute("vertex-a", currentPos)
			triangle.setAttribute("vertex-b", 
				AFRAME.utils.coordinates.stringify( ranked[0].el.getAttribute("position") ))
			triangle.setAttribute("vertex-c", 
				AFRAME.utils.coordinates.stringify( ranked[1].el.getAttribute("position") ))
			triangle.setAttribute("material", "side:double")
			meshEl.appendChild( triangle )
			meshTriangles.push( triangle )
		}
        }
}

AFRAME.registerComponent('dynamic-unless-picked', {
	init: function(){
		let el = this.el
		el.setAttribute('dynamic-body', "")
		this.el.addEventListener('picked', function (event) {
			el.removeAttribute('dynamic-body')
			el.setAttribute('static-body', "")
		})
		this.el.addEventListener('released', function (event) {
			el.removeAttribute('static-body')
			el.setAttribute('dynamic-body', "")
		})
	}
	// should unregister on remove
})

AFRAME.registerComponent('collider-check', {
  dependencies: ['raycaster'],

  init: function () {
    let worldPosition=new THREE.Vector3();
    let v3 = new THREE.Vector3
    let comeCloserInterval
    this.el.addEventListener('raycaster-intersection', function (e) {
      console.log('intersected')
      comeCloserInterval = setInterval( _=> {
	document.getElementById("leftHand").object3D.traverse( e => { if (e.name == "wrist") {
		worldPosition.copy(e.position);e.parent.updateMatrixWorld();e.parent.localToWorld(worldPosition)
	} })
	e.detail.intersections[0]?.object.el.object3D.position.lerp(worldPosition, 0.1)
	}, 100)
    });
    this.el.addEventListener('raycaster-intersection-cleared', function (e) {
      console.log('cleared')
      clearInterval( comeCloserInterval )
    });
  }
});

// should generalize to selector, like pushDownClass and related
function tiltUpId(id){ tiltId(id, 0.1) }
function tiltDownId(id){ tiltId(id, -0.1) }
function tiltId(id, value){
	document.getElementById(id).object3D.position.y+=value;
	document.getElementById(id).object3D.rotation.x+=value; 
}

function onNextPinchSplitReader(){
	//let id = getIdFromPick() // applies on primary only
		// does not work anymore ... but could listen to selectedElements changes via an observer but deprecated
		// proxy could be nice but requires to modify push() calls first
	let lastPrimary = selectedElements.filter( e => e.primary ).length

	let checkForNewPinches = setInterval( _ => {
		if (selectedElements.filter( e => e.primary ).length > lastPrimary){
			let id = getIdFromPick() // applies on primary only
			if (id) {
				let srcEditor = getEditorFromId( id )
				let editorParts = splitEditorHorizontally( srcEditor )
				// could position based on hands positions
				// should hide or even delete older one
				srcEditor.element.setAttribute('visible', false)
				// could display a line between current pinch and secondary hand
					// or temporary transparency on the 2 new editors
					// could attach on hand indexes
			}
			clearInterval(checkForNewPinches)
		}
	}, 50) // relatively cheap check, filtering on small array
}

function addConnectorsToCodeEditor( codeEditor, input=true, output=true){
	let el = codeEditor.element
	el.addEventListener("object3dset", e => {
		el.object3D.children[0].addEventListener("synccomplete", e => {
			b = el.object3D.children[0]._textRenderInfo.blockBounds
			w = b[2]-b[0]
			h = b[3]-b[1]
			// this assumes an axis aligned entity, which is correct until now
			if (input){
				el.setAttribute("line__input", `start: 0 0 0; end : -1 1 0; opacity: 1;`)
				el.setAttribute("line__input__end", `start: -1 1 0; end : -2 1 0; opacity: 1;`)
				// order matters for getConnectorsFromEditor, the very tip MUST be the end point
			}
			if (output){
				el.setAttribute("line__output", `start: ${w} ${-h} 0; end : ${w+1} ${-h-1} 0; opacity: 1;`)
				el.setAttribute("line__output__end", `start: ${w+1} ${-h-1} 0; end : ${w+2} ${-h-1} 0; opacity: 1;`)
				// order matters for getConnectorsFromEditor, the very tip MUST be the end point
			}
		})
	})
	return el
}

function connectionsBetweenEditors( a, b ){
	const connectionThreshold = 1 // to adjust after tries in VR, should probably be much shorter
	let ca = getConnectorsFromEditor( a )
	let cb = getConnectorsFromEditor( b )
	let links = []
	if ( ca.input && cb.output && ca.input.distanceTo(cb.output) < connectionThreshold ){
		links.push({source:a, target:b})
	}
	if ( cb.input && ca.output && cb.input.distanceTo(ca.output) < connectionThreshold ){
		links.push({source:b, target:a})
	}
	return links
}

function getConnectorsFromEditor( codeEditor ){
	const pos = new THREE.Vector3()
	const scale = new THREE.Vector3()
	const quaternion = new THREE.Quaternion()
	codeEditor.element.object3D.getWorldPosition(pos)
	codeEditor.element.object3D.getWorldScale(scale)
	codeEditor.element.object3D.getWorldQuaternion(quaternion)
	let connectors = {source: codeEditor}
	let res = ['input', 'output'].map( ctype => { // we might get different types of inputs or outputs later
		let i = codeEditor.element.getObject3D('line__'+ctype+'__end')
		if (i){
			let tip = new THREE.Vector3( ...i.geometry.attributes.position.array.slice(3)) // end point
			tip.applyQuaternion( quaternion )
			tip.multiply(scale)
			tip.add(pos)
			connectors[ctype] = tip
			//visualDebugSphere(tip)
		}
	})
	return connectors
}

function generateGraphFromEditors( editors ){
	let inputs = editors.map( e => getConnectorsFromEditor(e) ).filter( c => c.input )
	let outputs = editors.map( e => getConnectorsFromEditor(e) ).filter( c => c.output )
	let connections = []
	// check distances between all inputs with outputs which are not from the same source
	outputs.map( o => {
		inputs.map( i => {
			if (i.source != o.source && i.input.distanceTo( o.output ) < .2 )
				connections.push( { source: o.source, target: i.source })
		})
	})
	let graph = {}
	editors.map( (e) => {
		graph[e.element.id] = {}
		let g = graph[e.element.id] 
		g.editor = e
		g.predecessors = []
		g.successors = []
		connections.map( c => {
			if (c.target == e) g.predecessors.push(c.source)	
			if (c.source == e) g.successors.push(c.target)	
		})
	})
	return graph
}

function visualDebugSphere( pos ){
	let controlSphere = document.createElement("a-sphere")
	controlSphere.setAttribute("radius", 0.01) 
	controlSphere.setAttribute("color", "blue")
	controlSphere.setAttribute("wireframe", "true")
	controlSphere.setAttribute("segments-width", 8)
	controlSphere.setAttribute("segments-height", 8)
	controlSphere.classList.add('visualdebug')
	controlSphere.setAttribute("position", AFRAME.utils.coordinates.stringify( pos ) )
	AFRAME.scenes[0].appendChild( controlSphere )
	return controlSphere
}

function numberOfPredecessors( g ){ return Object.keys( g ).map( k => g[k].predecessors.length ) }

function numberOfSuccessors( g ){ return Object.keys( g ).map( k => g[k].successors.length ) }

function traverseFunctionGraph( g ){
	let callStack = []
	Object.keys( g ).map( k => {
		if (!g[k].predecessors.length) callStack.push( g[k] )
	} )
	if (callStack.length < 1){
		console.warn( 'no entry point found in editor graph' )
		return []
	}
	if (callStack.length > 1){
		console.warn( 'multiple entry point founds in editor graph' )
		return []
	}
	let pos = 0
	while ( callStack[pos].successors?.[0] ) {
		callStack.push( g[ callStack[pos].successors[0].element.id ] )
		pos++
	}
	return callStack
}

var points2D = []
function startDraw2D(){
// consider draw( pos ) too
	let p = document.querySelector('[pinchprimary]')
	let target = new THREE.Vector3(); // create once an reuse it
	p.addEventListener('pinchended', pinchPrimaryDraw2DEnded );
	let indexTipTracking
	let controlSphere
	function pinchPrimaryDraw2DEnded(event){
		let pos = event.detail.position.clone()
		let controlSphere = points2D[points2D.length-1]
		// check if close enough to starting point, if yes then remove listeners
		/*
		if ( pos.distanceTo( controlSphere.getAttribute("position") ) < .1 ){
			console.log('removed listeners')
			p.removeEventListener('pinchended', pinchPrimaryDraw2DEnded)
			p.removeEventListener('pinchmoved', pinchPrimaryDraw2DMoved)
			p.removeEventListener('pinchstarted', pinchPrimaryDraw2DStarted)
		}
		*/
		//clearInterval( indexTipTracking )

	}
	p.addEventListener('pinchmoved', pinchPrimaryDraw2DMoved );
	function pinchPrimaryDraw2DMoved(event){
		// update line ending point position
		let pos = event.detail.position.clone()
		//let controlSphere = points2D[points2D.length-1]
	}
	p.addEventListener('pinchstarted', pinchPrimaryDraw2DStarted );
	function pinchPrimaryDraw2DStarted(event){
		// creates an offset between last pinch and last index tip position
			// could merge them by updating the previous line end to the current pinch position
			// could add a new line between both
		if (points2D.length && points2D.length > 0){
			let lastPoint = points2D[points2D.length-1]
			let previouspos = 
				lastPoint.getAttribute("line__0").end.clone().add( lastPoint.getAttribute('position') )
		}
		controlSphere = document.createElement("a-sphere")
		points2D.push( controlSphere )
		let pos = event.detail.position.clone()
		controlSphere.className += "draw2d"
		controlSphere.setAttribute("radius", 0.005)
		controlSphere.setAttribute("color", "purple")
		controlSphere.setAttribute("wireframe", "true")
		controlSphere.setAttribute("segments-width", 8)
		controlSphere.setAttribute("segments-height", 8)
		controlSphere.setAttribute("position", pos)
		AFRAME.scenes[0].appendChild( controlSphere )
		controlSphere.setAttribute("line__0", `start: 0 0 0; end : 0 0 0; opacity: 1; color:purple;`)
		clearInterval( indexTipTracking )
		indexTipTracking = setInterval( _ => {
			target = p.components['hand-tracking-controls'].indexTipPosition
			// sometimes getting strange values, might check against null/0
			let line = controlSphere.getAttribute("line__0")
			let cspos = controlSphere.getAttribute("position")
			if (line){
				let previousPos = AFRAME.utils.coordinates.stringify( target.sub(cspos) )
				//pos.z = line.start.z // stick to a single plane, here axis aligned
				controlSphere.setAttribute("line__0", "end", previousPos)
			}
		}, 20)
	}
}

function colorGradient(fadeFraction, rgbColor1, rgbColor2, rgbColor3) {
// https://gist.github.com/gskema/2f56dc2e087894ffc756c11e6de1b5ed
    var color1 = rgbColor1;
    var color2 = rgbColor2;
    var fade = fadeFraction;

    // Do we have 3 colors for the gradient? Need to adjust the params.
    if (rgbColor3) {
      fade = fade * 2;

      // Find which interval to use and adjust the fade percentage
      if (fade >= 1) {
        fade -= 1;
        color1 = rgbColor2;
        color2 = rgbColor3;
      }
    }

    var diffRed = color2.red - color1.red;
    var diffGreen = color2.green - color1.green;
    var diffBlue = color2.blue - color1.blue;

    var gradient = {
      red: parseInt(Math.floor(color1.red + (diffRed * fade)), 10),
      green: parseInt(Math.floor(color1.green + (diffGreen * fade)), 10),
      blue: parseInt(Math.floor(color1.blue + (diffBlue * fade)), 10),
    };

    return 'rgb(' + Math.max(0,gradient.red) + ',' + Math.max(0,gradient.green) + ',' + Math.max(0,gradient.blue) + ')';
}

function presetColorGradient(fadeFraction){
  let highColor = { red: 217, green: 83, blue: 79 };
  let mediumColor = { red: 240, green: 173, blue: 78 };
  let lowColor = { red: 92, green: 184, blue: 91 };

  return colorGradient(fadeFraction, lowColor, mediumColor, highColor);
}

function tensionVisualized(){
	let p = document.querySelector('[pinchprimary]')
	let ptarget = new THREE.Vector3(); // create once an reuse it
	let s = document.querySelector('[pinchsecondary]')
	let starget = new THREE.Vector3(); // create once an reuse it
	let entity = document.createElement("a-entity")
	AFRAME.scenes[0].appendChild( entity )
	entity.setAttribute("line__0", `start: 0 0 0; end : 0 0 0; opacity: 1; color:purple;`)
	let indexesTipTracking = setInterval( _ => {
		ptarget = p.components['hand-tracking-controls'].indexTipPosition
		starget = s.components['hand-tracking-controls'].indexTipPosition
		// sometimes getting strange values, might check against null/0
		let line = entity.getAttribute("line__0")
		if (line){
			let start = AFRAME.utils.coordinates.stringify( ptarget )
			entity.setAttribute("line__0", "start", start)
			let end = AFRAME.utils.coordinates.stringify( starget )
			entity.setAttribute("line__0", "end", end)
			entity.setAttribute("line__0", "color", presetColorGradient( ptarget.distanceTo(starget)) )
		}
	}, 20)
}

function ontouch(){
	let p = document.querySelector('[pinchprimary]')
	let ptarget = new THREE.Vector3(); // create once an reuse it
	let indexesTipTracking = setInterval( _ => {
		ptarget = p.components['hand-tracking-controls'].indexTipPosition
		getClosestTargetElement( ptarget )?.setAttribute('wireframe', true)
	}, 20)
}

function thumbToIndexPull(){
	let p = document.querySelector('[pinchprimary]')
	let tip = new THREE.Vector3(); // create once an reuse it
	let proximal = new THREE.Vector3(); // create once an reuse it
	let thumb = new THREE.Vector3(); // create once an reuse it
	let touches = []
	const threshold_thumb2tip = 0.01
	const threshold_thumb2proximal = 0.05
	let indexesTipTracking = setInterval( _ => {
		// cpnsider getObjectByName() instead
		p.object3D.traverse( e => { if (e.name == 'index-finger-tip' ) tip = e.position })
		//index-finger-phalanx-distal 
		//index-finger-phalanx-intermediate
		p.object3D.traverse( e => { if (e.name == 'index-finger-phalanx-proximal' ) proximal = e.position })
		p.object3D.traverse( e => { if (e.name == 'thumb-tip' ) thumb = e.position })
		let touch = {}
		touch.date = Date.now()
		touch.thumb2tip = thumb.distanceTo(tip)
		if (!touch.thumb2tip) return
		touch.thumb2proximal = thumb.distanceTo(proximal)
		//console.log( touch.thumb2tip, touch.thumb2proximal )
		// usually <1cm				<4cm (!)
		//if ((touch.thumb2tip && touch.thumb2tip < threshold_thumb2tip)
			//|| (touch.thumb2proximal && touch.thumb2proximal < threshold_thumb2proximal))
		if (touch.thumb2tip < threshold_thumb2tip
			|| touch.thumb2proximal < threshold_thumb2proximal){
			if (touches.length){
				let previous = touches[touches.length-1]
				if (touch.date - previous.date < 300){
					if (touch.thumb2tip < threshold_thumb2tip &&
						previous.thumb2proximal < threshold_thumb2proximal){
						console.log('^')
						p.emit('thumb2indexpull')
					}
					if (touch.thumb2proximal < threshold_thumb2proximal &&
						previous.thumb2tip < threshold_thumb2tip){
						console.log('v')
						p.emit('thumb2indexpush')
					}
				}
			}
			touches.push(touch)
		}
	}, 50)
	// TODO
	// Bind thumb2indexpush/thumb2indexpull to zoom in/out "world" i.e all assets that aren't "special" e.g self, lights, UI
}

function thumbToIndexAngle(){
	let p = document.querySelector('[pinchprimary]')
	let tip = new THREE.Vector3(); // create once an reuse it
	let metacarpal = new THREE.Vector3(); // create once an reuse it
	let thumb = new THREE.Vector3(); // create once an reuse it
	let indexesTipTracking = setInterval( _ => {
		p.object3D.traverse( e => { if (e.name == 'index-finger-tip' ) tip = e.position })
		p.object3D.traverse( e => { if (e.name == 'thumb-metacarpal' ) metacarpal = e.position })
		p.object3D.traverse( e => { if (e.name == 'thumb-tip' ) thumb = e.position })
		tip.sub(metacarpal)
		thumb.sub(metacarpal)
		let angle = thumb.angleTo(tip)
		if (angle > 0.9 && angle < 1.2) {
			console.log( 'r' )
			p.emit('thumb2indexpush')
			// could insert (with max threshold) a targe entity between tip and thumb
				// this entity could then ondrop add a new post it note or jxr element
		}
		// could also check angle against head to insure it's facing the user
	}, 590)
}

AFRAME.registerComponent('annotation', {
// consider also multiple annotation but being mindful that it might clutter significantly
  schema: {
	content : {type: 'string'}
  },
  init: function () {
	addAnnotation(this.el, this.data.content)
  },
  update: function () {
	this.el.querySelector('.annotation').setAttribute('value', this.data.content )
	// assuming single annotation
  },
  remove: function () {
	this.el.querySelector('.annotation').removeFromParent()
	//Array.from( this.el.querySelectorAll('.annotation') ).map( a => a.removeFromParent() )
  }
})

function addAnnotation(el, content){
	// could also appear only when in close proximity or while pinching
	let annotation = document.createElement( 'a-troika-text' )
	annotation.classList.add( 'annotation' )
	annotation.setAttribute('value', content)
	annotation.setAttribute('position', '0 .1 -.1')
	annotation.setAttribute('rotation', '-90 0 0')
	annotation.setAttribute("anchor", "left" )
	annotation.setAttribute("outline-width", "5%" )
	annotation.setAttribute("outline-color", "black" )
	el.appendChild(annotation)
	return el
}

// used for testing, now that jxr.js is outside of index.html, could consider putting this back in index.html instead to keep behavior one would expect from a library
// does indeed create problems, namely other pages relying on it do get this testing behavior
AFRAME.registerComponent('startfunctions', {
  init: function () {

/* class clonableasset : Crystal.glb Fish.glb Mountains.glb Penguin.glb Pinetree.glb
consider also 
	backend needed for caching
		getPolyList(keyword) cachePoly(res) loadPolyThumbnails(res) loadFirstPolyModel(res) loadPolyModels(res)


see https://git.benetou.fr/utopiah/text-code-xr-engine/issues/52 for more shorthands

*/
	const movePenguin = "jxr qs #penguin sa position 1 0 -2"
	const rotatePenguin = "jxr qs #penguin sa rotation 0 -20 0"

	//addBlockCodeExample(text="hi", pos="0 1.4 -0.2", color="black", outlineColor="white")
	addBlockCodeExample('add penguin', '0 1.5 -0.2')
	let elToAnnotate = addBlockCodeExample('move penguin forward', '0 1.6 -0.2')
	addAnnotation(elToAnnotate, 'fait avancer pengouin')
	console.log(elToAnnotate)
	addBlockCodeExample('add green cube', '0 1.4 -0.2')

	addBlockCodeExample(movePenguin, '0 1.45 -0.2')
	addBlockCodeExample(rotatePenguin, '0 1.55 -0.2')
// should change color and enable the 2 new types

	//relies on addCompoundPrimitiveExample() which already uses snap-on-pinched-ended
	// also relies on addNewNote() so means code might be executed on left pinch or move with right pinch indepdently from block, to verify

	let el = generateCompoundPrimitiveStart(position="-0.2 1.5 -0.2")
	targets.push(el)
	//el.setAttribute('snap-on-pinchended', true) 
	el.setAttribute('scale', '.1 .1 .1') 
	AFRAME.scenes[0].appendChild(el)

	el = generateCompoundPrimitiveEnd(position="0.2 1.5 -0.2")
	targets.push(el)
	//el.setAttribute('snap-on-pinchended', true) 
	el.setAttribute('scale', '.1 .1 .1') 
	AFRAME.scenes[0].appendChild(el)

	let h = [
		[1,1,1,1,1,1,1,1,1,1],
		[1,0,0,0,1,0,0,0,0,1],
		[1,0,0,0,0,1,0,0,0,1],
		[1,0,0,0,1,0,0,0,0,1],
		[1,0,0,0,0,1,0,0,0,1],
		[1,0,0,0,1,0,0,0,0,1],
		[1,0,0,0,0,1,0,0,0,1],
		[1,0,0,0,1,0,0,0,0,1],
		[1,0,0,0,0,1,0,0,0,1],
		[1,1,1,1,1,1,1,1,1,1],
	]
	for (let z=0;z<10;z++)
		for (let x=0;x<10;x++){
			el = document.createElement("a-entity")
			el.setAttribute('position', (x-5) + ' 0 ' + (z-5) )
			el.setAttribute('geometry', "primitive: cylinder; segmentsRadial: 8; segmentsHeight: 1; radius: 0.5; height: "+(h[x][z]+.1)+";" )
			el.setAttribute('material', 'color', 'lightblue')
			AFRAME.scenes[0].appendChild(el)
		}

	// consider instanciateFromPrimitive() also in order to clone a set of blocks
  }
})