//
// Handle correct visibility of Notes on a Scene
//

import {libWrapper} from './libwrapper-shim.js'

const MODULE_NAME = "revealed-notes-manager";
const USE_PIN_REVEALED = "usePinRevealed";
const PIN_IS_REVEALED  = "pinIsRevealed";
const FLAG_IS_REVEALED  = `flags.${MODULE_NAME}.${PIN_IS_REVEALED}`;
const FLAG_USE_REVEALED = `flags.${MODULE_NAME}.${USE_PIN_REVEALED}`;
const CONFIG_TINT_REACHABLE_LINK   = "tintReachableLink";
const CONFIG_TINT_UNREACHABLE_LINK = "tintUnreachableLink";
const CONFIG_TINT_UNREVEALED = "tintUnrevealed";
const CONFIG_TINT_REVEALED   = "tintRevealed";

/**
 * Wraps the default Note#isVisible to allow the visibility of scene Notes to be controlled by the reveal
 * state stored in the Note (overriding the default visibility which is based on link accessibility).
 * @param {function} [wrapped] The wrapper function provided by libWrapper
 * @param {Object}   [args]    The arguments for Note#refresh
 * @return [Note]    This Note
 */
function Note_isVisible(wrapped, ...args) {
	
	// See if reveal state is enabled for this note.
	if (!this.document.getFlag(MODULE_NAME, USE_PIN_REVEALED)) return wrapped(...args);

	// Replace the testUserPermission test of Note#isVisible
	const access = this.document.getFlag(MODULE_NAME, PIN_IS_REVEALED);
	// Standard version of Note#isVisible
  if ( (access === false) || !canvas.visibility.tokenVision || this.document.global ) return access;
  const point = {x: this.document.x, y: this.document.y};
  const tolerance = this.document.iconSize / 4;
  return canvas.visibility.testVisibility(point, {tolerance, object: this});
}

/**
 * Wraps the default Note#_refreshState so that we can override the stored icon tint based
 * on whether the link is accessible for the current player (or not). This is only done for links which
 * are using the "revealed" flag.
 * @param {function} [wrapped] The wrapper function provided by libWrapper
 * @param {Object}   [args]    The arguments for Note#_refreshState
 * @return [Note]    This Note
 */

function Note_refreshState(wrapped, ...args) {
	if (!this.document.getFlag(MODULE_NAME, USE_PIN_REVEALED)) return wrapped(...args);
	
	const is_revealed = this.document.getFlag(MODULE_NAME, PIN_IS_REVEALED);
	if (is_revealed == undefined) return wrapped(...args);

	const is_linked = this.entry?.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED);
	const colour = game.settings.get(MODULE_NAME, is_linked ? CONFIG_TINT_REACHABLE_LINK : CONFIG_TINT_UNREACHABLE_LINK);
	if (!colour?.valid) return wrapped(...args);
	
	// Temporarily set the icon tint
	wrapped(...args);
	this.controlIcon.icon.tint = colour;
}

// Replacement for Note#_refreshState for GMs, to show which pins are revealed.
function Note_refreshStateGM(wrapped, ...args) {
	if (!this.document.getFlag(MODULE_NAME, USE_PIN_REVEALED)) return wrapped(...args);
	
	const is_revealed = this.document.getFlag(MODULE_NAME, PIN_IS_REVEALED);
	if (is_revealed == undefined) return wrapped(...args);

	const colour = game.settings.get(MODULE_NAME, is_revealed ? CONFIG_TINT_REVEALED : CONFIG_TINT_UNREVEALED);
	if (!colour?.valid) return wrapped(...args);
	
	// Temporarily set the icon tint
	wrapped(...args);
	this.controlIcon.icon.tint = colour;
}

function Note_onUpdate(wrapper, changed, options, userId) {
// Foundry V11: Note#_onUpdate needs to set refreshText render flag
	let result = wrapper(changed, options, userId);
	if (this.renderFlags && changed?.flags?.[MODULE_NAME]) {
		// Ensure everything is redrawn - since icon colour might change, not just visibility
		this.renderFlags.set({redraw: true})
	}
	return result;
}

/**
 * Sets whether this Note is revealed (visible) to players; overriding the default FoundryVTT rules.
 * The iconTint will also be set on the Note based on whether there is a link that the player can access.
 * If this function is never called then the default FoundryVTT visibility rules will apply
 * @param [NoteData] [notedata] The NoteData whose visibility is to be set (can be used before the Note has been created)
 * @param {Boolean}  [visible]  pass in true if the Note should be revealed to players
 */
export function setNoteRevealed(notedata,visible) {
	// notedata might not exist as a Note, so setFlag is not available
	foundry.utils.setProperty(notedata, FLAG_USE_REVEALED, true);
	foundry.utils.setProperty(notedata, FLAG_IS_REVEALED,  visible);
}

Hooks.once('canvasInit', () => {
	// This is only required for Players, not GMs (game.user accessible from 'ready' event but not 'init' event)
	if (!game.user.isGM) {
		libWrapper.register(MODULE_NAME, 'CONFIG.Note.objectClass.prototype.isVisible',        Note_isVisible,       libWrapper.MIXED);
		libWrapper.register(MODULE_NAME, 'CONFIG.Note.objectClass.prototype._refreshState', Note_refreshState, libWrapper.WRAPPER);
	} else {
		libWrapper.register(MODULE_NAME, 'CONFIG.Note.objectClass.prototype._refreshState', Note_refreshStateGM, libWrapper.WRAPPER);
	}
	libWrapper.register(MODULE_NAME, 'CONFIG.Note.objectClass.prototype._onUpdate', Note_onUpdate, libWrapper.WRAPPER);
})

//
// Update NoteConfig to handle REVEALED state
//

/**
 * Update Note config window with a text box to allow entry of GM-text.
 * Also replace single-line of "Text Label" with a textarea to allow multi-line text.
 * @param {NoteConfig} app    The Application instance being rendered (NoteConfig)
 * @param {HTMLElement} html  The inner HTML of the document that will be displayed and may be modified
 * @param {Object} data       The object of data used when rendering the application (from NoteConfig#getData)
 */
Hooks.on("renderNoteConfig", async function (app, html, data) {

	// Check box to control use of REVEALED state

  const note = data.document;

  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.innerText = "Revealed State";

  // Pseudo-datafield for our entry inside the document's flags.
  const flags = new foundry.data.fields.ObjectField({label: "module-flags"}, {parent: data.fields.flags, name: MODULE_NAME});

  const mode_control = (new foundry.data.fields.BooleanField(
    {
      label: "Use Reveal State",
      initial: (note.getFlag(MODULE_NAME, USE_PIN_REVEALED) ?? false) },
    { parent: flags, name: USE_PIN_REVEALED })).toFormGroup();
  const revealed_control = (new foundry.data.fields.BooleanField(
    {
      label: "Revealed to Players",
      initial: (note.getFlag(MODULE_NAME, PIN_IS_REVEALED) ?? true) },
    { parent: flags, name: PIN_IS_REVEALED })).toFormGroup();

  fieldset.append(legend);
  fieldset.append(mode_control);
	fieldset.append(revealed_control);

  const body = app.element.querySelector("div.form-body");
  body.append(fieldset);
})

function refresh () {
	if (canvas?.ready) {
		console.warn('NOTES:refresh called');
		canvas.notes.placeables.forEach(note => note.draw());
	}
}

Hooks.once('init', () => {
	globalThis.setNoteRevealed = setNoteRevealed;
    game.settings.register(MODULE_NAME, CONFIG_TINT_REACHABLE_LINK, {
		name: "Linked Icon Tint",
		hint: "For PLAYERs, the RGB value to be used to tint scene Notes if they have a reachable link (if left blank then the tint, if any, will remain unchanged).",
		scope: "world",
		type:  new foundry.data.fields.ColorField({initial: '#7CFC00'}),
		config: true,
		onChange: () => refresh()
	});
    game.settings.register(MODULE_NAME, CONFIG_TINT_UNREACHABLE_LINK, {
		name: "Not-linked Icon Tint",
		hint: "For PLAYERs, the RGB value to be used to tint scene Notes if they do not have a reachable link (if left blank then the tint, if any, will remain unchanged).",
		scope: "world",
		type:  new foundry.data.fields.ColorField({initial: '#c000c0'}),
		config: true,
		onChange: () => refresh()
	});
    game.settings.register(MODULE_NAME, CONFIG_TINT_REVEALED, {
		name: "Revealed Icon Tint",
		hint: "For GMs, the RGB value to be used to tint scene Notes if they have been revealed to players (if left blank then the tint, if any, will remain unchanged)",
		scope: "world",
		type:  new foundry.data.fields.ColorField({initial: '#ffff00'}),
		config: true,
		onChange: () => refresh()
	});
    game.settings.register(MODULE_NAME, CONFIG_TINT_UNREVEALED, {
		name: "Not-revealed Icon Tint",
		hint: "For GMs, the RGB value to be used to tint scene Notes if they have not been revealed to players (if left blank then the tint, if any, will remain unchanged)",
		scope: "world",
		type:  new foundry.data.fields.ColorField({initial: '#ff0000'}),
		config: true,
		onChange: () => refresh()
	});
})