function addNewNoteAsPostItNote( text, position=`-0.2 1.1 -0.1`, scale= "0.1 0.1 0.1", id=null, classes="notes", visible="true", rotation="0 0 0" ){
	let note = addNewNote( text, position, scale, id, classes, visible, rotation)
	//note.setAttribute("troika-text","clipRect","100,100,100,100")
	const colorSchemes = {
		yellow: {light:'yellow', dark:'orange'},
		blue: {light:'cyan', dark:'blue'},
		pink: {light:'pink', dark:'red'},
	}
	let selectedColor = 'yellow'
	if (text.match(prefix) ) selectedColor = "blue"
	note.setAttribute("troika-text","maxWidth","1")
	note.setAttribute("troika-text","outlineWidth","0")
	note.setAttribute("troika-text","color","black")
	note.setAttribute("troika-text","anchor","left")
	note.setAttribute("troika-text","baseline","top")
	let backgroundEl = document.createElement("a-plane") // could curve ever so slightly
	backgroundEl.setAttribute("color", colorSchemes[selectedColor].light )
	backgroundEl.setAttribute("material", "side", "double")
	backgroundEl.setAttribute("position", "0.45 -0.45 -0.001")
	note.appendChild(backgroundEl)
	let cornerEl = document.createElement("a-triangle") 
	cornerEl.setAttribute("color", colorSchemes[selectedColor].dark )
	cornerEl.setAttribute("position", ".8 -.8 0")
	cornerEl.setAttribute("rotation", "0 0 45")
	cornerEl.setAttribute("scale", ".3 .145 1")
	//backgroundEl.setAttribute("vertex-c", "0 0 -0.001")
	note.appendChild(cornerEl)
	return note
}
