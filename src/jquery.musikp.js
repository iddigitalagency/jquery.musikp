/**
 * A jQuery plugin boilerplate.
 * Author:
 */


// the semi-colon before function invocation is a safety net against concatenated
// scripts and/or other plugins which may not be closed properly.
;( function( $, window, document, undefined ) {

	"use strict";

	// Create the defaults once
	var pluginName = "musikp",
		defaults = {
			mode: 'auto', // gui, api, auto
			classPrefix: 'musikp',
			tpl: null,
			playBt: '>',
			pauseBt: '||',
			stopBt: 'X',
			nextBt: '>>',
			prevBt: '<<',
			expandBt: '^',
			debug: false,
			autoPlay: false,
			onPause: function () {},
			onPlay: function () {}
		};

	// Bind global events
	function _bindEvents() {

		this.$elem.find('[data-musikp]').on('click', function(e) {
			e.preventDefault();
			this.play( $( e.target ).data('musikp') );
		}.bind(this));

	}

	// Bind global events
	function _bindGuiEvents() {

		$('.'+ this.settings.classPrefix +'-gui').find('[data-action="play"]').on('click', function(e) {
			e.preventDefault();
			this.play('current');
		}.bind(this));

		$('.'+ this.settings.classPrefix +'-gui').find('[data-action="next"]').on('click', function(e) {
			e.preventDefault();
			this.next();
		}.bind(this));

		$('.'+ this.settings.classPrefix +'-gui').find('[data-action="prev"]').on('click', function(e) {
			e.preventDefault();
			this.prev();
		}.bind(this));

		$('.'+ this.settings.classPrefix +'-gui').find('[data-action="expand"]').on('click', function(e) {
			e.preventDefault();
			this.toggleExpandedGUI();
		}.bind(this));

		this.audio.addEventListener('loadeddata', function() {
			$('.'+ this.settings.classPrefix +'-gui').find('[data-live="duration"]').html( _readableDuration.apply(this, [this.audio.duration]) );
		}.bind(this));

		this.audio.addEventListener('timeupdate', function() {
			$('.'+ this.settings.classPrefix +'-gui').find('[data-live="timer"]').html( _readableDuration.apply(this, [this.audio.currentTime]) );
		}.bind(this));

	}

	// Sort tracks
	function _sortTracks() {

		// utility functions
		var default_cmp = function(a, b) {
				if (a == b) return 0;
				return a < b ? -1 : 1;
			},
			getCmpFunc = function(primer, reverse) {
				var cmp = default_cmp;
				if (primer) {
					cmp = function(a, b) {
						return default_cmp(primer(a), primer(b));
					};
				}
				if (reverse) {
					return function(a, b) {
						return -1 * cmp(a, b);
					};
				}
				return cmp;
			};

		// actual implementation
		var sort_by = function() {
			var fields = [],
				n_fields = arguments.length,
				field, name, reverse, cmp;

			// preprocess sorting options
			for (var i = 0; i < n_fields; i++) {
				field = arguments[i];
				if (typeof field === 'string') {
					name = field;
					cmp = default_cmp;
				}
				else {
					name = field.name;
					cmp = getCmpFunc(field.primer, field.reverse);
				}
				fields.push({
					name: name,
					cmp: cmp
				});
			}

			return function(A, B) {
				var a, b, name, cmp, result;
				for (var i = 0, l = n_fields; i < l; i++) {
					result = 0;
					field = fields[i];
					name = field.name;
					cmp = field.cmp;

					result = cmp(A[name], B[name]);
					if (result !== 0) break;
				}
				return result;
			}
		};

		this.tracks = this.tracks.sort(sort_by('album_id', {
			name: 'track_number',
			primer: parseInt,
			reverse: false
		}));

	}

	// Read the user playlist
	function _readPlaylist () {

		this.albums = (typeof this.settings.playlist.albums != 'undefined') ? this.settings.playlist.albums : [];
		this.tracks = (typeof this.settings.playlist.tracks != 'undefined') ? this.settings.playlist.tracks : [];

		_sortTracks.apply(this);

		this.currentSoundtrack = this.tracks[0].id;

		this.debug('Playlist: '+ this.albums.length +' albums, '+ this.tracks.length +' soundtracks');

	}

	// Generate the player interface
	function _generateGUI () {

		/**
		 * $class : Class prefix
		 * $prev : Previous button
		 * $next : Next button
		 * $play : Play/Pause button
		 * $expand : Expand player button
		 */

		// Get first track info
		var initial_track_info = this.getTrackInfo(this.tracks[0].id);

		_createAudioElem.apply(this);

		this.audio.src = initial_track_info.mp3;

		var default_tpl = 	'<div class="$class-player">' +
								'<div class="$class-wrapper">' +

									'<div class="$class-button">' +
										                        '$prev' +
									'</div>' +
									'<div class="$class-button $class-button-xl">' +
										'$play' +
									'</div>' +
									'<div class="$class-button">' +
										'$next' +
									'</div>' +
									'<div class="$class-timer">' +
										'<span data-live="artist">' + initial_track_info.artist + '</span> - <span data-live="title">' + initial_track_info.title + '</span> &nbsp; | &nbsp; ' +
										'<span data-live="timer">00:00</span> / <span data-live="duration">00:00</span>' +
									'</div>' +
									// '<div class="$class-button $class-button-xs">' +
									// 	'$expand' +
									// '</div>' +

								'</div>' +
							'</div>';

		var tpl = default_tpl;
		if (this.settings.tpl != null && this.settings.tpl.length > 3) {
			tpl = this.settings.tpl;
		}

		tpl += '<div class="$class-tracklist">';

		// Logic for displaying tracks not contained in albums
		tpl += 'Other tracks:';
		tpl += '<ul>';
		for (var index = 0; index < this.tracks.length; ++index) {
			if ( !(typeof this.tracks[index].album_id != 'undefined') ) {
				var trackInfos = this.getTrackInfo(this.tracks[index].id);
				tpl += '<li>'+ trackInfos.track_number +'. <a data-musikp="'+ trackInfos.id +'" href="#">'+ trackInfos.title +'</a></li>';
			}
		}
		tpl += '</ul>';

		// Logic to display albums list
		for (var index = 0; index < this.albums.length; ++index) {

			var albumInfos = this.getAlbumInfo(this.albums[index].id);

			tpl += '<a data-musikp="'+ albumInfos.id +'" href="#">'+ albumInfos.artist +' - '+ albumInfos.title +'</a>';
			tpl += 	'<a data-musikp="'+ albumInfos.id +'" href="#">' +
						'<div class="$class-cover" style="background-image:url(\''+ albumInfos.cover +'\');"></div>'+
							albumInfos.artist +' - '+ albumInfos.title +
					'</a>';
			tpl += '<ul>';

			for (var trackIndex = 0; trackIndex < albumInfos.tracks.length; ++trackIndex) {

				var trackInfos = this.getTrackInfo(albumInfos.tracks[trackIndex]);
				tpl += '<li>'+ trackInfos.track_number +'. <a data-musikp="'+ trackInfos.id +'" href="#">'+ trackInfos.title +'</a></li>';

			}

			tpl += '</ul>';

		}

		tpl += '</div>';

		function escapeRegExp(str) { return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1"); }
		function replaceAll(str, find, replace) { return str.replace(new RegExp(escapeRegExp(find), 'g'), replace); }

		tpl = replaceAll(tpl, '$class', this.settings.classPrefix);
		tpl = replaceAll(tpl, '$prev', '<span data-action="prev">' + this.settings.prevBt + '</span>');
		tpl = replaceAll(tpl, '$next', '<span data-action="next">' + this.settings.nextBt + '</span>');
		tpl = replaceAll(tpl, '$play', '<span data-action="play">' + this.settings.playBt + '</span>');
		tpl = replaceAll(tpl, '$expand', '<span data-action="expand">' + this.settings.expandBt + '</span>');

		$('body').append('<div class="'+ this.settings.classPrefix +'-gui">'+ tpl +'</div>');

		setTimeout( function () {

			$('body')
				.find('.'+ this.settings.classPrefix +'-gui')
				.addClass(''+ this.settings.classPrefix +'-loaded');

		}.bind(this), 1000);

		this.debug('GUI opened');
		this.isGUIVisible = true;

		_bindGuiEvents.apply(this);

	}

	// Create an audio element attached to the plugin
	function _createAudioElem () {

		this.audio = document.createElement('audio');

	}

	// Return a readable duration format
	function _readableDuration(seconds) {

		var sec = Math.floor( seconds );
		var min = Math.floor( sec / 60 );

		min = min >= 10 ? min : '0' + min;
		sec = Math.floor( sec % 60 );
		sec = sec >= 10 ? sec : '0' + sec;

		return min + ':' + sec;

	}

	// Update GUI data-live tags
	function _updateGUILive (trackInfo) {

		$('.'+ this.settings.classPrefix +'-gui').find('[data-live]').each(function (i, e) {

			var $this = $( e );
			var $var = $this.data('live');

			if ($var != 'duration' && $var != 'timer') {
				$this.html(trackInfo[$var]);
			}

		}.bind(this));

	}

	// The actual plugin constructor
	function Plugin ( element, options ) {

		this.element = element;
		this.$elem = $(this.element);

		this.settings = $.extend( {}, defaults, options );
		this._defaults = defaults;
		this._name = pluginName;

		this.init();

	}

	// Avoid Plugin.prototype conflicts
	$.extend( Plugin.prototype, {

		// Initiate the plugin instance
		init: function () {

			this.isGUIVisible = false;

			_readPlaylist.apply(this);
			_createAudioElem.apply(this);

			if (this.settings.mode === 'gui')
				_generateGUI.apply(this);

			_bindEvents.apply(this);

			if (this.settings.autoPlay === true)
				this.play();

		},

		// Plugin debug logger
		debug: function (message) {

			if (this.settings.debug === true) console.log('--- '+ message +' ---');

		},

		// Check if the given id is a track
		isTrack: function (id) {

			var track = $.grep(this.tracks, function(e){ return e.id == id; });
			if (track.length > 0) return track[0];

			return false;

		},

		// Check if the given id is an album
		isAlbum: function (id) {

			var album = $.grep(this.albums, function(e){ return e.id == id; });
			if (album.length > 0) return album[0];

			return false;

		},

		// Return the current soundtrack id
		getCurrentSoundtrackId: function () {

			return this.currentSoundtrack;

		},

		// Toggle the expanded gui view
		toggleExpandedGUI: function () {

			$('.'+ this.settings.classPrefix +'-gui').toggleClass('expanded');

		},

		// Get info from an album id
		getAlbumInfo: function (id) {

			var album = this.isAlbum(id);

			if (album != false) {

				var tracks = $.grep(this.tracks, function(e){ return e.album_id == album.id; });

				if (tracks.length > 0) {
					album.tracks = [];

					$.each(tracks, function(key, val) {
						album.tracks.push(tracks[key].id);
					});
				}

				return album;
			}

			return false;

		},

		// Get info from a track id
		getTrackInfo: function (id) {

			var track = this.isTrack(id);

			if (track != false) {

				var album = this.getAlbumInfo(track.album_id);
				if (album != false) track.album = album;

				return track;
			}

			return false;

		},

		// Generic play button
		play: function (id) {

			if (id != 'current') {

				if (!this.isGUIVisible && this.settings.mode != 'api')
					_generateGUI.apply(this);

				var trackInfo = this.getTrackInfo(id);

				if (trackInfo != false) {

					this.currentSoundtrack = trackInfo.id;
					if (this.audio.src != trackInfo.mp3) this.audio.src = trackInfo.mp3;
					this.audio.play();

					$('.' + this.settings.classPrefix + '-gui')
						.find('[data-action="play"]')
						.html(this.settings.pauseBt)

					_updateGUILive.apply(this, [trackInfo]);
					this.debug('Play: ' + trackInfo.title + '');

					this.settings.onPlay(this.getCurrentSoundtrackId());

				} else {

					var albumInfo = this.getAlbumInfo(id);

					if (albumInfo != false) {
						this.play(albumInfo.tracks[0]);
					} else {
						this.play('current');
					}

					this.settings.onPlay(this.getCurrentSoundtrackId());

				}

			} else {

				if ( !this.audio.paused ) this.pause();
				else {
					if (typeof this.audio.src != 'undefined' && this.audio.src.length > 3) {
						this.audio.play();
						$('.' + this.settings.classPrefix + '-gui')
							.find('[data-action="play"]')
							.html(this.settings.pauseBt)

						this.settings.onPlay(this.getCurrentSoundtrackId());

					} else {
						this.play( this.getCurrentSoundtrackId() );
					}
				}

			}

		},

		// Generic pause button
		pause: function () {

			this.audio.pause();

			var trackId = this.getCurrentSoundtrackId();

			$('.'+ this.settings.classPrefix +'-gui')
				.find('[data-action="play"]')
				.html(this.settings.playBt);

			this.debug('Paused');

			this.settings.onPause(trackId);

		},

		// Generic stop button
		stop: function () {

			this.pause();
			this.audio.currentTime = 0;
			this.debug('Stopped');

		},

		// Play next sound in the list or album
		next: function () {

			var currentTrack = this.getTrackInfo( this.getCurrentSoundtrackId() );
			var currentTrackIndex = this.tracks.indexOf( currentTrack );

			if(currentTrackIndex >= 0 && currentTrackIndex < this.tracks.length - 1) {
				this.play( this.tracks[currentTrackIndex + 1].id );
			} else {
				this.play( this.tracks[0].id );
			}

		},

		// Play previous sound in the list or album
		prev: function () {

			var currentTrack = this.getTrackInfo( this.getCurrentSoundtrackId() );
			var currentTrackIndex = this.tracks.indexOf( currentTrack );

			if(currentTrackIndex > 0 && currentTrackIndex <= this.tracks.length - 1) {
				this.play( this.tracks[currentTrackIndex - 1].id );
			} else {
				this.play( this.tracks[this.tracks.length - 1].id );
			}

		}

	} );

	// A really lightweight plugin wrapper around the constructor.
	// e.g. $(element).defaultPluginName('functionName', arg1, arg2)
	$.fn[pluginName] = function ( options ) {
		var args = arguments;

		// Is the first parameter an object (options), or was omitted,
		// instantiate a new instance of the plugin.
		if (options === undefined || typeof options === 'object') {
			return this.each(function () {

				// Only allow the plugin to be instantiated once,
				// so we check that the element has no plugin instantiation yet
				if (!$.data(this, 'plugin_' + pluginName)) {

					// if it has no instance, create a new one,
					// and store the plugin instance
					$.data(this, 'plugin_' + pluginName, new Plugin( this, options ));
				}
			});

			// If the first parameter is a string and it doesn't start
			// with an underscore or "contains" the `init`-function,
			// treat this as a call to a public method.
		} else if (typeof options === 'string' && options[0] !== '_' && options !== 'init') {

			// Cache the method call to make it possible to return a value
			var returns;

			this.each(function () {
				var instance = $.data(this, 'plugin_' + pluginName);

				// Tests that there's already a plugin-instance
				// and checks that the requested public method exists
				if (instance instanceof Plugin && typeof instance[options] === 'function') {

					// Call the method of our plugin instance,
					// and pass it the supplied arguments.
					returns = instance[options].apply( instance, Array.prototype.slice.call( args, 1 ) );
				}

				// Allow instances to be destroyed via the 'destroy' method
				if (options === 'destroy') {
					$.data(this, 'plugin_' + pluginName, null);
				}
			});

			// If the earlier cached method
			// gives a value back return the value,
			// otherwise return this to preserve chainability.
			return returns !== undefined ? returns : this;
		}
	};

} )( jQuery, window, document );