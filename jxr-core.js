const prefix = /^jxr /
const codeFontColor = "lightgrey"
const fontColor= "white"
var selectedElement = null;
var targets = []
const zeroVector3 = new THREE.Vector3()
var bbox = new THREE.Box3()
bbox.min.copy( zeroVector3 )
bbox.max.copy( zeroVector3 )
var selectionBox = new THREE.BoxHelper( bbox.object3D, 0x0000ff);
var groupHelpers = []
var primaryPinchStarted = false
var wristShortcut = "jxr switchToWireframe()"
var selectionPinchMode = false
var groupingMode = false
var hudTextEl // should instead rely on the #typinghud selector in most cases
const startingText = "[]"
var added = []
const maxItemsFromSources = 20
let alphabet = ['abcdefghijklmnopqrstuvwxyz', '0123456789', '<>'];
var commandhistory = []
var groupSelection = []
var primarySide = 0
const sides = ["right", "left"]
var pinches = [] // position, timestamp, primary vs secondary
var dl2p = null // from distanceLastTwoPinches
var selectedElements = [];
var billboarding = false

// ==================================== picking ======================================================

AFRAME.registerComponent('target', {
  init: function () {
	targets.push( this.el )
	this.el.classList.add("collidable")
  }
  // on remove should also remove from targets, e.g targets = targets.filter( e => e != target)
})

function getClosestTargetElements( pos, threshold=0.05 ){ // if done frequently on large amount of targets, e.g hover on keyboard keys, consider proper structure e.g octree instead
	// TODO Bbox intersects rather than position
	return targets.filter( e => e.getAttribute("visible") == true)
		// .map( t => { return { el: t, dist : pos.distanceTo(t.getAttribute("position") ) } })
			// limited to local position
		.map( t => {
			let posTarget = new THREE.Vector3()
			t.object3D.getWorldPosition( posTarget )
			let d = pos.distanceTo( posTarget )
			return { el: t, dist : d }
		})
		// needs reparenting to scene via attach() otherwise lead to strange behavior
		.filter( t => t.dist < threshold && t.dist > 0 )
		.sort( (a,b) => a.dist > b.dist)
}

function getClosestTargetElement( pos, threshold=0.05 ){ // 10x lower threshold for flight mode
	var res = null
	const matches = getClosestTargetElements( pos, threshold)
	if (matches.length > 0) res = matches[0].el
	return res
}

// ==================================== HUD ======================================================

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

function showhistory(){
	setFeedbackHUD("history :\n")
	commandhistory.map( i => appendToHUD(i.uninterpreted+"\n") )
}

function saveHistoryAsCompoundSnippet(){
	addNewNote( commandhistory.map( e => e.uninterpreted ).join("\n") )
}

// ==================================== pinch primary and secondary  ======================================================

AFRAME.registerComponent('pinchsecondary', { 
        events: {
                pinchended: function (event) {
			selectedElement = getClosestTargetElement( event.detail.position )
			selectedElements.push({element:selectedElement, timestamp:Date.now(), primary:false})
			// if close enough to a target among a list of potential targets, unselect previous target then select new
			if (selectedElement) interpretJXR( selectedElement.getAttribute("value") )
			selectedElement = null
		},
		pinchmoved: function (event) {
			if (selectionPinchMode){
				bbox.min.copy( event.detail.position )
				setFeedbackHUD( "selectionPinchMode updated min")
				if (!bbox.max.equal(zeroVector3))
					selectionBox.update();
			}
		},
		pinchstarted: function (event) {
			if (!selectionPinchMode) bbox.min.copy( zeroVector3 )
			if (selectionPinchMode) setFeedbackHUD( "selectionPinchMode started")
		},
         },
});

// grouping and distance between last two pinches should be rewritten, simplified and more reliable
AFRAME.registerComponent('pinchprimary', { // currently only 1 hand, the right one, should be switchable
        events: {
                pinchended: function (event) {
			let closests = getClosestTargetElements( event.detail.position )
			let dist = 100
			if ( document.querySelector("#box") )
				dist = event.detail.position.distanceTo( document.querySelector("#box").object3D.position )
			if (dist < .1){ 
				setFeedbackHUD("close enough, replaced shortcut with "+ selectedElement.getAttribute("value") )
				wristShortcut = selectedElement.getAttribute("value")
			}
			if (selectedElement){
				let content = selectedElement.getAttribute("value")
				selectedElement.emit('released', {element:selectedElement, timestamp:Date.now(), primary:true})
				if (billboarding) selectedElement.object3D.rotation.set( 0, 0, 0 )
			}
			// unselect current target if any
			selectedElement = null;
			if ( groupingMode ) addToGroup( event.detail.position )
			selectionPinchMode = false
			setTimeout( _ => primaryPinchStarted = false, 200) // delay otherwise still activate on release
			var newPinchPos = new THREE.Vector3()
			newPinchPos.copy(event.detail.position )
			pinches.push({position:newPinchPos, timestamp:Date.now(), primary:true})
			dl2p = distanceLastTwoPinches()
		},
                pinchmoved: function (event) {
			if (selectionPinchMode){
				bbox.max.copy( event.detail.position )
				if (!bbox.min.equal(zeroVector3))
					selectionBox.update();
			}
			if (selectedElement && !groupingMode) {
				selectedElement.setAttribute("position", event.detail.position)
				this.el.object3D.traverse( e => {
					if (e.name == "ring-finger-tip"){
						selectedElement.object3D.rotation.copy( e.rotation )
					}
				})
				// rotation isn't ideal with the wrist as tend not have wrist flat as we pinch
			}
			if (selectedElement) selectedElement.emit("moved", {element:selectedElement, timestamp:Date.now(), primary:true})
			// might be costly...
		},
		pinchstarted: function (event) {
			primaryPinchStarted = true
			if (!selectionPinchMode) bbox.max.copy( zeroVector3 )

			selectedElement = getClosestTargetElement( event.detail.position )
			if (selectedElement) {
				selectedElements.push({element:selectedElement, timestamp:Date.now(), primary:true})
				selectedElement.emit("picked", {element:selectedElement, timestamp:Date.now(), primary:true})
			}
		}
	}
	// should remove event listeners
})

// avoiding setOnDropFromAttribute() as it is not idiosyncratic and creates timing issues
AFRAME.registerComponent('onreleased', { // changed from ondrop to be coherent with event name
        schema: {default: ""},  // type: "string" forced to avoid object type guess parsing
// could support multi
// could check if target component is already present on this.el, if not, add it as it's required
        events: {
                released: function (e) {
                        let code = this.el.getAttribute('onreleased')
			// if multi, should also look for onreleased__ not just onreleased
                        try {   
                                eval( code ) // should be jxr too e.g if (txt.match(prefix)) interpretJXR(txt)
				// note that event details are avaible within that code as e.detail which might not be very clear
                        } catch (error) {
                                console.error(`Evaluation failed with ${error}`);
                        }
                }
        }
})

AFRAME.registerComponent('onpicked', {
        schema: {default: ""},  // type: "string" forced to avoid object type guess parsing
// could support multi
// could check if target component is already present on this.el, if not, add it as it's required
        events: {
                picked: function (e) {
                        let code = this.el.getAttribute('onpicked')
			// if multi, should also look for onreleased__ not just onreleased
                        try {   
                                eval( code ) // should be jxr too e.g if (txt.match(prefix)) interpretJXR(txt)
				// note that event details are avaible within that code as e.detail which might not be very clear
                        } catch (error) {
                                console.error(`Evaluation failed with ${error}`);
                        }
                }
        }
})

function onNextPrimaryPinch(callback){
	// could add an optional filter, e.g only on specific ID or class
		// e.g function onNextPrimaryPinch(callback, filteringSelector){}
	let lastPrimary = selectedElements.filter( e => e.primary ).length
	let checkForNewPinches = setInterval( _ => {
		if (selectedElements.filter( e => e.primary ).length > lastPrimary){
			let latest =  selectedElements[selectedElements.length-1].element
			if (latest) callback(latest)
			clearInterval(checkForNewPinches)
		}
	}, 50) // relatively cheap check, filtering on small array
}

function distanceLastTwoPinches(){
        let dist = null
        if (pinches.length>1){
                dist = pinches[pinches.length-1].position.distanceTo( pinches[pinches.length-2].position )
        }
        return dist
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

// ==================================== keyboard ======================================================

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
	}
}

// ==================================== note as text and possibly executable snippet  ======================================================

function addNewNote( text, position=`-0.2 1.1 -0.1`, scale= "0.1 0.1 0.1", id=null, classes="notes", visible="true", rotation="0 0 0" ){
	var newnote = document.createElement("a-troika-text")
	newnote.setAttribute("anchor", "left" )
	newnote.setAttribute("outline-width", "5%" )
	newnote.setAttribute("outline-color", "black" )
	newnote.setAttribute("visible", visible )

	if (id) 
		newnote.id = id
	else
		newnote.id = "note_" + crypto.randomUUID() // not particularly descriptive but content might change later on
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

AFRAME.registerComponent('gltf-jxr', {
  events: {
    "model-loaded": function (evt) {
	this.el.object3D.traverse( n => { if (n.userData.jxr) {
		console.log(n.userData)
		// need to make gltf become a child of a note to be executable on pinch
		// try reparenting first... otherwise var clone = this.el.cloneNode(true)
			// might not be great, cf https://github.com/aframevr/aframe/issues/2425
		let pos = this.el.object3D.position.clone()
		let rot = this.el.object3D.rotation.clone()
		this.el.remove()
		
		let note = addNewNote( n.userData.jxr, pos, "0.1 0.1 0.1", null, "gltf-jxr-source")
		let clone = this.el.cloneNode(true)
		clone.setAttribute('position', '0 0 0')
		clone.setAttribute('scale', '10 10 10') // assuming not scaled until now, surely wrong
		// need rescaling to current scale by 1/0.1, clone.setAttribute(
		clone.removeAttribute('gltf-jxr')
		note.appendChild(clone)
		}
	})
    },
  },

	/* example of backend code to annotate the glTF
	import { NodeIO } from '@gltf-transform/core';
	import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
	const document = await io.read('PopsicleChocolate.glb');
	const node = document.getRoot() // doesn't seem to work.listNodes().find((node) => node.getName() === 'RootNode');
	node.setExtras({jxr: "jxr addNewNote('hi')"});
	await io.write('output.glb', document);
	*/
});


// ==================================== interactions beyond pinch ======================================================

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

// from https://aframe.io/aframe/examples/showcase/hand-tracking/pressable.js
AFRAME.registerComponent('pressable', {
	schema:{pressDistance:{default:0.06}},
	init:function(){this.worldPosition=new THREE.Vector3();this.handEls=document.querySelectorAll('[hand-tracking-controls]');this.pressed=false;},
	tick:function(){var handEls=this.handEls;var handEl;var distance;for(var i=0;i<handEls.length;i++){handEl=handEls[i];distance=this.calculateFingerDistance(handEl.components['hand-tracking-controls'].indexTipPosition);if(distance> 0 && distance<this.data.pressDistance){if(!this.pressed){this.el.emit('pressedstarted');} this.pressed=true;return;}} if(this.pressed){this.el.emit('pressedended');} this.pressed=false;},
	calculateFingerDistance:function(fingerPosition){var el=this.el;var worldPosition=this.worldPosition;worldPosition.copy(el.object3D.position);el.object3D.parent.updateMatrixWorld();el.object3D.parent.localToWorld(worldPosition);return worldPosition.distanceTo(fingerPosition);}
});

AFRAME.registerComponent('start-on-press', {
        // should become a property of the component instead to be more flexible.
        init: function(){
                let el = this.el
                this.el.addEventListener('pressedended', function (event) {
		console.log(event)
                        if (!primaryPinchStarted && wristShortcut.match(prefix)) interpretJXR(wristShortcut)
                })
        }
})

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

let changeovercheck
AFRAME.registerComponent('changeover', {
  schema: { color : {type: 'string'} },
  init: function () {
	// (this.el, this.data.content)
	if (changeovercheck) return
	let player = document.getElementById('player') // assuming single player, non networked
	console.log('adding timer')
	changeovercheck = setInterval( _ => {
		let pos = player.getAttribute('position').clone()
		pos.y = 0.1 // hard coded but should be from component element
		let hits = Array.from(document.querySelectorAll('[changeover]'))
			.filter( e => e.getAttribute("visible") == true)
			.map( t => { return { el: t, dist : pos.distanceTo(t.getAttribute("position") ) } })
			.filter( t => t.dist < 0.02 ) 
			.sort( (a,b) => a.dist > b.dist)
		//console.log(hits.length)
		if (hits.length>0) {
			setFeedbackHUD('touching cone')
			console.log('touching cone')
			hits[hits.length-1].el.setAttribute('color', 'red')
		}
	}, 50)
  }
})

// to add only on selectable elements, thus already with a target component attached
AFRAME.registerComponent('pull', {
  events: {
    picked: function (evt) {
      this.startePos = this.el.getAttribute('position').clone()
      this.starteRot = this.el.getAttribute('rotation')//.clone() not necessary as converted first
      this.decimtersEl = document.createElement('a-troika-text')
      AFRAME.scenes[0].appendChild(this.decimtersEl)
    },
    moved: function (evt) {
      let pos = AFRAME.utils.coordinates.stringify( this.startePos )
      let oldpos = AFRAME.utils.coordinates.stringify( this.el.getAttribute('position') )
      AFRAME.scenes[0].setAttribute("line__pull", `start: ${oldpos}; end : ${pos};`)
      let d = this.startePos.distanceTo( this.el.getAttribute('position') )
      // could show a preview state before release, e.g 
      let decimeters = Math.round(d*10)
      console.log('pulling '+decimeters+' pages')
      // update visible value instead, ideally under line but still facing user
      let textPos = new THREE.Vector3()
      textPos.lerpVectors(this.startePos, this.el.getAttribute('position'), .7)
      this.decimtersEl.setAttribute('position', textPos )
      this.decimtersEl.setAttribute('rotation', this.el.getAttribute('rotation') )
      this.decimtersEl.setAttribute('value', decimeters )
  },
    released: function (evt) {
      let d = this.startePos.distanceTo( this.el.getAttribute('position') )
      console.log('This entity was released '+ d + 'm away from picked pos')
      this.el.setAttribute('position', AFRAME.utils.coordinates.stringify( this.startePos ))
      this.el.setAttribute('rotation', AFRAME.utils.coordinates.stringify( this.starteRot ))
      AFRAME.scenes[0].removeAttribute("line__pull")
      this.decimtersEl.remove()
    },
  },
});
// ==================================== utils on entities and classes ======================================================
	
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

function switchSide(){
	// should work properly now
	document.querySelector("#"+sides[primarySide]+"Hand").removeAttribute("pinchprimary")
	document.querySelector("#"+sides[secondarySide]+"Hand").removeAttribute("pinchsecondary")
	document.querySelector("#"+sides[secondarySide]+"Hand").removeAttribute("wristattachsecondary")
	document.querySelector("#"+sides[secondarySide]+"Hand").setAttribute("pinchprimary", "")
	document.querySelector("#"+sides[primarySide]+"Hand").setAttribute("pinchsecondary", "")
	if ( document.querySelector("#box") )
		document.querySelector("#"+sides[primarySide]+"Hand").setAttribute("wristattachsecondary", "target: #box")
	if (primarySide == 0) {
		secondarySide = 0
		primarySide = 1
	} else {
		primarySide = 0
		secondarySide = 1
	}
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

function toggleBillboarding(){ billboarding=!billboarding }

// ==================================== facilitating debugging ======================================================

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

function switchToWireframe(){
        let model = document.querySelector("#environment")?.object3D
        if (model) model.traverse( o => { if (o.material) {
                        let visible = !o.material.wireframe
                        o.material.wireframe = visible;
                        o.material.opacity = visible ? 0.05 : 1;
                        o.material.transparent = visible;
        } })
}
