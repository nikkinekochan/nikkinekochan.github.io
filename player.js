/*
FreeWheel
*/

var tv = tv || {};
tv.freewheel = tv.freewheel || {};
tv.freewheel.DemoPlayer = function() {
	// Bind event listeners
	this.onContentPauseRequest = this.onContentPauseRequest.bind(this);
	this.onContentResumeRequest = this.onContentResumeRequest.bind(this);
	this.onContentVideoTimeUpdated = this.onContentVideoTimeUpdated.bind(this);
	this.onContentVideoEnded = this.onContentVideoEnded.bind(this);
	this.onRequestComplete = this.onRequestComplete.bind(this);
	this.onSlotEnded = this.onSlotEnded.bind(this);

	// Step #1: Obtain content metadata
	var theNetworkId = 511351;
	var theServerURL = "https://7cd77.v.fwmrm.net/ad/g/1";
	var theProfileId = "511351:ftv_brut_sdk_web"
	var theVideoAssetId = "www.brut.fr/nature/animals";
	var theSiteSectionId  = "brut_testsite";
	var theVideoDuration = 500;
	var theVideoAssetFallbackId = 190455434;
	var theVideoViewRandom = 81582222222;
	var theSiteSectionFallbackId = 9078403;
	var thePageViewRandom = 81582222222;

	// Step #2: Initialize AdManager
	// Only one AdManager instance is needed for each player
	this.adManager = new tv.freewheel.SDK.AdManager();
	this.adManager.setNetwork(theNetworkId);
	this.adManager.setServer(theServerURL);

	// Saving content src to play after the preroll finishes
	this.videoElement = document.getElementById('videoPlayer');
	this.contentSrc = this.videoElement.currentSrc;

	// Saving the content time when midroll starts so that content resumes after midroll finishes
	this.contentPausedOn = 0;
	// Keeps track of current playing slot
	this.currentSlot = null;
	// Helps handling pause/resume logic
	this.isContentPlaying = false;
	this.isPauseMidrollPlaying = false;

	// Creating ad context
	this.currentAdContext = this.adManager.newContext();
	this.currentAdContext.setProfile(theProfileId);
	this.currentAdContext.setVideoAsset(theVideoAssetId, theVideoDuration,null,null,theAutoPlayType,theVideoViewRandom,null,theVideoAssetFallbackId,null);
	this.currentAdContext.setSiteSection(theSiteSectionId,null,thePageViewRandom,null,theSiteSectionFallbackId);

};

tv.freewheel.DemoPlayer.prototype = {
	requestAds: function() {
		// Step #3: Configure ad request
		this.prerollSlots = [];
		this.postrollSlots = [];
		this.overlaySlots = [];
		this.midrollSlots = [];
		this.pauseMidrollSlots = [];

		// Add 1 preroll, 1 midroll, 2 overlay, 1 postroll slot
		this.currentAdContext.addTemporalSlot("Preroll_1", tv.freewheel.SDK.ADUNIT_PREROLL, 0);
		this.currentAdContext.addTemporalSlot("Midroll_1", tv.freewheel.SDK.ADUNIT_MIDROLL, 6);
		this.currentAdContext.addTemporalSlot("Overlay_1", tv.freewheel.SDK.ADUNIT_OVERLAY, 10);
		this.currentAdContext.addTemporalSlot("Overlay_2", tv.freewheel.SDK.ADUNIT_OVERLAY, 20);
		this.currentAdContext.addTemporalSlot("Postroll_1", tv.freewheel.SDK.ADUNIT_POSTROLL, 120);
		this.currentAdContext.addTemporalSlot("pause_midroll_1", tv.freewheel.SDK.ADUNIT_PAUSE_MIDROLL, 0);

		// Let context object knows where to render the ad, using the id of a div containing a video element
		this.currentAdContext.registerVideoDisplayBase("displayBase");

		// Step #4: Add custom target key
		this.currentAdContext.addKeyValue("skippable", "enabled");

		// Listen to AdManager Events
		this.currentAdContext.addEventListener(tv.freewheel.SDK.EVENT_CONTENT_VIDEO_PAUSE_REQUEST, this.onContentPauseRequest);
		this.currentAdContext.addEventListener(tv.freewheel.SDK.EVENT_CONTENT_VIDEO_RESUME_REQUEST, this.onContentResumeRequest);
		this.currentAdContext.addEventListener(tv.freewheel.SDK.EVENT_REQUEST_COMPLETE, this.onRequestComplete);
		this.currentAdContext.addEventListener(tv.freewheel.SDK.EVENT_SLOT_ENDED, this.onSlotEnded);

		this.currentAdContext.setParameter('extension.skippableAd.enabled', true, window.tv.freewheel.SDK.PARAMETER_LEVEL_GLOBAL);
		this.currentAdContext.setParameter(tv.freewheel.SDK.PARAMETER_USE_GDPR_TCFAPI, true, tv.freewheel.SDK.PARAMETER_LEVEL_GLOBAL);

		// Submit ad request
		this.currentAdContext.submitRequest();
	},

	// Step #4: Listen for ad request completed and set all slot variables
	onRequestComplete: function(event) {
		this.currentAdContext.removeEventListener(tv.freewheel.SDK.EVENT_REQUEST_COMPLETE,this.onRequestComplete);
		// After request completes, store each roll in corresponding slot array
		if (event.success) {
			var fwTemporalSlots = this.currentAdContext.getTemporalSlots();
			for (var i = 0; i < fwTemporalSlots.length; i++) {
				var slot = fwTemporalSlots[i];
				var slotTimePositionClass = slot.getTimePositionClass();
				if (slotTimePositionClass == tv.freewheel.SDK.TIME_POSITION_CLASS_PREROLL) {
					this.prerollSlots.push(slot);
				} else if (slotTimePositionClass == tv.freewheel.SDK.TIME_POSITION_CLASS_OVERLAY) {
					this.overlaySlots.push(slot);
				} else if (slotTimePositionClass == tv.freewheel.SDK.TIME_POSITION_CLASS_MIDROLL) {
					this.midrollSlots.push(slot);
				} else if (slotTimePositionClass == tv.freewheel.SDK.TIME_POSITION_CLASS_POSTROLL) {
					this.postrollSlots.push(slot);
				} else if (slotTimePositionClass == tv.freewheel.SDK.TIME_POSITION_CLASS_PAUSE_MIDROLL) {
					this.pauseMidrollSlots.push(slot);
				}
			}
			$("#start").attr('disabled', false);
		}
	},

	// Step #5: Play preroll
	playPreroll: function() {
		// Play preroll slot and then remove the played slot from preroll slot array
		if (this.prerollSlots.length > 0) {
			console.log("\n==============playing preroll==============\n");
			this.currentSlot = this.prerollSlots.shift();
			this.isContentPlaying = false;
			this.currentSlot.play();
		} else {
			// When there are no more preroll slots to play, play content
			this.playContent();
		}
	},

	// Step #5: Add event listener for onSlotEnded
	onSlotEnded: function(event) {
		// Play the next preroll/postroll ad when either a preroll or postroll stops
		// For a midroll slot, call restoreContentAfterMidroll() and wait for next midroll(if any)
		var slotTimePositionClass = event.slot.getTimePositionClass();
		console.log(`==============previous ${slotTimePositionClass.toLowerCase()} slot ended==============`)
		if (slotTimePositionClass == tv.freewheel.SDK.TIME_POSITION_CLASS_PREROLL) {
			this.playPreroll();
		} else if (slotTimePositionClass == tv.freewheel.SDK.TIME_POSITION_CLASS_MIDROLL) {
			this.restoreContentAfterMidroll();
		} else if (slotTimePositionClass == tv.freewheel.SDK.TIME_POSITION_CLASS_POSTROLL) {
			this.playPostroll();
		} else if (slotTimePositionClass == tv.freewheel.SDK.TIME_POSITION_CLASS_PAUSE_MIDROLL) {
			this.restoreContentAfterPauseMidroll();
		}
	},

	// Step #6: Play content video
	playContent: function() {
		console.log("\n==============playing content==============\n");
		// Play video content, and add event listener to trigger when video time updates or video content ends
		this.videoElement.controls = true;
		this.videoElement.src = this.contentSrc;
		this.addContentVideoListeners();
		this.currentAdContext.setVideoState(tv.freewheel.SDK.VIDEO_STATE_PLAYING);
		this.isContentPlaying = true;
		this.videoElement.play();
	},

	addContentVideoListeners: function() {
		this.videoElement.addEventListener('timeupdate', this.onContentVideoTimeUpdated);
		this.videoElement.addEventListener('ended', this.onContentVideoEnded);
	},

	removeContentVideoListeners: function() {
		this.videoElement.removeEventListener('timeupdate', this.onContentVideoTimeUpdated);
		this.videoElement.removeEventListener('ended', this.onContentVideoEnded);
	},

	onContentVideoTimeUpdated: function() {
		if (this.overlaySlots.length == 0 && this.midrollSlots.length == 0) {
			this.videoElement.removeEventListener('timeupdate', this.onContentVideoTimeUpdated);
		}

		// Check whether overlay needs to be played
		for (var i = 0; i < this.overlaySlots.length; i++) {
			var overlaySlot = this.overlaySlots[i];
			var slotTimePosition = overlaySlot.getTimePosition();
			var videoCurrentTime = this.videoElement.currentTime;

			if (Math.abs(videoCurrentTime - slotTimePosition) < 0.5) {
				this.overlaySlots.splice(i, 1);
				overlaySlot.play();
				if (document.querySelector('[id^="_fw_ad_container_iframe_Overlay_2"]')){
					document.querySelector('[id^="_fw_ad_container_iframe_Overlay_2"]').style.marginBottom = "50px";
				}
				return;
			}
		}

		// Step #7: Pause content and play midroll advertisements
		// Check whether midroll needs to be played
		for (var i = 0; i < this.midrollSlots.length; i++) {
			var midrollSlot = this.midrollSlots[i];
			var slotTimePosition = midrollSlot.getTimePosition();
			var videoCurrentTime = this.videoElement.currentTime;

			if (Math.abs(videoCurrentTime - slotTimePosition) < 0.5) {
				this.contentPausedOn = this.videoElement.currentTime;
				this.midrollSlots.splice(i, 1);
				this.currentSlot = midrollSlot;
				this.isContentPlaying = false;
				this.currentSlot.play();
				return;
			}
		}
	},

	pause: function(event) {
		if (this.isContentPlaying) {
			console.log(`=====pause called during content video playback=====`);
			this.videoElement.pause();
			if (this.pauseMidrollSlots.length !== 0 && this.pauseMidrollSlots[0].getAdCount() !== 0) {
				this.isContentPlaying = false;
				this.contentPausedOn = this.videoElement.currentTime;
				var event = {
					action: tv.freewheel.SDK.EVENT_USER_ACTION_PAUSE_BUTTON_CLICKED
				};
				this.currentAdContext.dispatchEvent(tv.freewheel.SDK.EVENT_USER_ACTION_NOTIFIED, event);
				this.removeContentVideoListeners();
				this.isPauseMidrollPlaying = true;
			}
		} else {
			console.log(`=====pause called during non-pause ad playback=====`);
			this.currentSlot.pause();
		}
	},

	resume: function() {
		var isNonPauseAdPlaying = !this.isContentPlaying && !this.isPauseMidrollPlaying;

		if (this.isPauseMidrollPlaying) {
			console.log(`=====resume called during pause midroll ad playback=====`);
			this.isPauseMidrollPlaying = false;
			var event = {
				action: tv.freewheel.SDK.EVENT_USER_ACTION_RESUME_BUTTON_CLICKED
			};
			this.currentAdContext.dispatchEvent(tv.freewheel.SDK.EVENT_USER_ACTION_NOTIFIED, event);
			this.isContentPlaying = true;
		} else if (isNonPauseAdPlaying) {
			console.log(`=====resume called during non-pause ad playback=====`);
			this.currentSlot.resume();
		} else {
			console.log(`=====resume called during content video playback=====`);
			this.videoElement.play();
		}
	},

	onContentPauseRequest: function() {
		this.removeContentVideoListeners();
		this.currentAdContext.setVideoState(tv.freewheel.SDK.VIDEO_STATE_PAUSED);
	},

	onContentResumeRequest: function() {
		this.addContentVideoListeners();
		this.currentAdContext.setVideoState(tv.freewheel.SDK.VIDEO_STATE_PLAYING);
	},

	restoreContentAfterMidroll: function() {
		// If the midroll slot was empty, the contentSrc will still be set
		if (this.videoElement.src != this.contentSrc) {
			console.log(`===========resume video after: ${this.contentPausedOn}===========`);
			this.videoElement.src = this.contentSrc;
			this.isContentPlaying = true;
			this.videoElement.currentTime = this.contentPausedOn;
		}
	},

	restoreContentAfterPauseMidroll: function() {
		this.restoreContentAfterMidroll();
		this.addContentVideoListeners();
		if (!this.isPauseMidrollPlaying) {
			this.videoElement.play();
		} else {
			this.isPauseMidrollPlaying = false;
		}
	},

	// Step #8: Play postroll advertisements when content ends
	onContentVideoEnded: function() {
		console.log("\n==============content ended==============\n");
		// Remove the event listener for detecting when the content video ends, and play postroll if any
		this.videoElement.removeEventListener('ended', this.onContentVideoEnded);
		this.currentAdContext.setVideoState(tv.freewheel.SDK.VIDEO_STATE_COMPLETED);
		this.playPostroll();
	},

	// Step #8: Play postroll advertisements when content ends
	playPostroll: function() {
		// Play postroll(s) if any, otherwise cleanup
		if (this.postrollSlots.length) {
			console.log("\n==============playing postroll==============\n");
			this.currentSlot = this.postrollSlots.shift();
			this.isContentPlaying = false;
			this.currentSlot.play();
		} else {
			this.cleanUp();
		}
	},

	cleanUp: function() {
		// Clean up after postroll ended or content ended(no postroll)
		if (this.currentAdContext) {
			this.currentAdContext.removeEventListener(tv.freewheel.SDK.EVENT_SLOT_ENDED, this.onSlotEnded);
			this.currentAdContext.removeEventListener(tv.freewheel.SDK.EVENT_CONTENT_VIDEO_PAUSE_REQUEST, this.onContentPauseRequest);
			this.currentAdContext.removeEventListener(tv.freewheel.SDK.EVENT_CONTENT_VIDEO_RESUME_REQUEST, this.onContentResumeRequest);
			this.currentAdContext.dispose();
			this.currentAdContext = null;
		}
		location.reload();
	}
};
