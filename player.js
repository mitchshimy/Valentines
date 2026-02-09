    // ====== GLOBAL VARIABLES ======
    let youtubePlayer;
    let audioPlayer;
    let isPlaying = false;
    let isPowerOn = true;
    let currentSongIndex = 0;
    let currentTime = 0;
    let totalTime = 0;
    let cards = [];
    let audioDurations = {};
    let isPlaylistOpen = false;
    let isQuotesMode = false;
    let isMobileView = false;

    // Music Library (treat as immutable source of truth)
    const musicLibrary = [
      {
        title: "Chikwere",
        artist: "Bien",
        audioUrl: "assets/music/chikwere.mp3",
        image: "assets/images/4.jpg",
        cardValue: "J",
        cardSuit: "♥",
        quote: "Me: unbothered, moisturized, in my lane, well-hydrated, flourishing.",
        quoteAuthor: "Cardi B"
      },
      {
        title: "No One Like You",
        artist: "P-square",
        audioUrl: "assets/music/noonelikeyou.mp3",
        image: "assets/images/1.jpg",
        cardValue: "K",
        cardSuit: "♥",
        quote: "Ukona kwela fine,ukona figure fine,kila kitu yako msupa fine",
        quoteAuthor: "Mad G"
      },
      {
        title: "Its You",
        artist: "Njerae",
        audioUrl: "assets/music/itsyou.mp3",
        image: "assets/images/2.jpg",
        cardValue: "Q",
        cardSuit: "♥",
        quote: "Not that I don’t got good vision, but I don’t see competition.",
        quoteAuthor: "Nicki"
      },
      {
        title: "Happy you’re Mine",
        artist: "Chris Martin",
        audioUrl: "assets/music/happyyouremine.mp3",
        image: "assets/images/3.jpg",
        cardValue: "A",
        cardSuit: "♥",
        quote: "Girl, you’re so fine. You're beauty redefines. You need to be fined",
        quoteAuthor: "Shimy"
      },
      {
        title: "Residuals",
        artist: "Chris Brown",
        audioUrl: "assets/music/residuals.mp3",
        image: "assets/images/6.jpg",
        cardValue: "9",
        cardSuit: "♥",
        quote: "I woke up like this. We flawless.",
        quoteAuthor: "Beyonce"
      },
      {
        title: "Feel my love",
        artist: "SautiSol",
        audioUrl: "assets/music/feelmylove.mp3",
        image: "assets/images/7.jpg",
        cardValue: "8",
        cardSuit: "♥",
        quote: "She really that A-list girl,she really my favourite girl",
        quoteAuthor: "Darkoo"
      },
            {
        title: "Little Things",
        artist: "Ella Mai",
        duration: 605,
        audioUrl: "assets/music/littlethings.mp3",
        image: "assets/images/5.jpg",
        cardValue: "7",
        cardSuit: "♥",
        quote: "She's just a girl, and she's on fire",
        quoteAuthor: "Alicia Keys"
      },
      {
        title: "Feel The Love",
        artist: "Kahuti ft Kinoti",
        audioUrl: "assets/music/feelthelove.mp3",
        image: "assets/images/8.jpg",
        cardValue: "7",
        cardSuit: "♥",
        quote: "I hate to see her go but I love to watch her leave",
        quoteAuthor: "Lil Wayne"
      },
      {
        title: "Najuta",
        artist: "Sanaipei Tande",
        audioUrl: "assets/music/najuta.mp3",
        image: "assets/images/9.jpg",
        cardValue: "7",
        cardSuit: "♥",
        quote: "I hate to see her go but I love to watch her leave",
        quoteAuthor: "Lil Wayne"
      },
    ];

    // Keep an immutable copy reference (original indices are canonical)
    const originalLibrary = musicLibrary.slice();

    // displayOrder maps display index -> originalLibrary index
    // Do NOT mutate originalLibrary; change displayOrder to reorder UI only
    let displayOrder = originalLibrary.map((_, i) => i);

    // Current track identity and player helpers
    let currentTrackId = null; // canonical id (audioUrl)
    let pendingSeekTime = null; // used to seek once metadata loads
    let audioListenersAttached = false;
    let lastSentPreferredMusicUrl = null; // dedupe SW messages

    let lastTimeUpdate = 0;

    function attachAudioListenersOnce() {
      if (audioListenersAttached) return;
      audioListenersAttached = true;

      audioPlayer.addEventListener('timeupdate', onTimeUpdate);
      audioPlayer.addEventListener('loadedmetadata', onLoadedMetadata);
      audioPlayer.addEventListener('ended', onTrackEnded);
      audioPlayer.addEventListener('error', onAudioError);

      // NEW: sync play/pause icon automatically
      audioPlayer.addEventListener('play', () => {
        isPlaying = true;
        updatePlayPauseIcon();
      });

      audioPlayer.addEventListener('pause', () => {
        isPlaying = false;
        updatePlayPauseIcon();
      });
    }

    // Update the icon element
    function updatePlayPauseIcon() {
      const playIcon = document.getElementById('playIcon');
      if (!playIcon) return;
      playIcon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
    }


    function onTimeUpdate() {
      const now = performance.now();
      if (now - lastTimeUpdate < 400) return;
      lastTimeUpdate = now;

      currentTime = Math.floor(audioPlayer.currentTime || 0);
      updateProgressBar();
      savePlayerState();
    }

    function onLoadedMetadata() {
      totalTime = Math.floor(audioPlayer.duration || 0);
      updateTotalTimeDisplay();

      if (pendingSeekTime != null) {
        audioPlayer.currentTime = pendingSeekTime;
        pendingSeekTime = null;
      }
    }

    function onTrackEnded() {
      nextSong();
    }

    function onAudioError() {
      console.warn('Audio error, skipping track');
      nextSong();
    }


    function getTrackByDisplayIndex(displayIndex) {
      const origIdx = displayOrder[displayIndex];
      return originalLibrary[origIdx];
    }

    function findDisplayIndexByTrackId(trackId) {
      const origIdx = originalLibrary.findIndex(t => t.audioUrl === trackId);
      if (origIdx === -1) return -1;
      return displayOrder.indexOf(origIdx);
    }

    function getCurrentSongIndex() {
      if (!currentTrackId) return -1;
      return findDisplayIndexByTrackId(currentTrackId);
    }


    function isValidDisplayOrder(arr) {
      if (!Array.isArray(arr) || arr.length !== originalLibrary.length) return false;
      const sorted = arr.slice().sort((a,b)=>a-b);
      for (let i=0;i<sorted.length;i++) if (sorted[i] !== i) return false;
      return true;
    }

  // ====== LOCAL STORAGE FUNCTIONS ======
function savePlayerState() {
  const playerState = {
    // Persist canonical identity (trackId) and display ordering
    currentTrackId: currentTrackId,
    displayOrder: displayOrder.slice(),
    currentTime: currentTime,
    isPlaying: isPlaying,
    isPowerOn: isPowerOn,
    theme: document.body.dataset.theme || "",
    volume: audioPlayer.volume || 1
  };
  localStorage.setItem('musicPlayerState', JSON.stringify(playerState));
}

function loadPlayerState() {
  const savedState = localStorage.getItem('musicPlayerState');
  if (!savedState) return false;

  try {
    const state = JSON.parse(savedState);

    // THEME
    if (state.theme !== undefined) {
      document.body.setAttribute('data-theme', state.theme);
      updateThemeIcon();
    }

    // POWER
    if (state.isPowerOn !== undefined) {
      isPowerOn = state.isPowerOn;

      const powerSwitch = document.getElementById('powerSwitch');
      const ipod = document.querySelector('.ipod');

      if (powerSwitch && ipod) {
        powerSwitch.classList.toggle('on', isPowerOn);
        powerSwitch.classList.toggle('off', !isPowerOn);
        ipod.classList.toggle('off', !isPowerOn);
      }
    }

    // DISPLAY ORDER
    if (state.displayOrder && isValidDisplayOrder(state.displayOrder)) {
      displayOrder = state.displayOrder.slice();
    }

    // ENSURE UI EXISTS
    if (!cards || cards.length === 0) {
      createCardDeck();
    }

    // TRACK RESTORE (CANONICAL)
    if (state.currentTrackId) {
      const displayIdx = findDisplayIndexByTrackId(state.currentTrackId);
      const targetIndex = displayIdx !== -1 ? displayIdx : 0;

      currentTime = state.currentTime || 0;

      setTrack(targetIndex, {
        forcePlay: false,
        resetTime: false
      });

      pendingSeekTime = currentTime;

      // AUTOPLAY RECOVERY
      if (state.isPlaying && isPowerOn) {
        setTimeout(() => {
          playSong(true);
        }, 300);
      }
    }

    // VOLUME
    if (state.volume !== undefined && audioPlayer) {
      audioPlayer.volume = state.volume;
    }

    return true;
  } catch (err) {
    console.error("Failed to load player state:", err);
    return false;
  }
}




function clearPlayerState() {
  localStorage.removeItem('musicPlayerState');
}

// Auto-save on various events
function setupAutoSave() {
  // Save before page unload
  window.addEventListener('beforeunload', savePlayerState);
  
  // Save on visibility change (when tab switches)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      savePlayerState();
    }
  });
}

// ====== TYPING ANIMATION FUNCTIONS ======
let currentTypingTimeout = null;
let isTyping = false;

function typeText(element, text, speed = 120, callback = null) {
  if (currentTypingTimeout) {
    clearTimeout(currentTypingTimeout);
    isTyping = false;
  }
  
  // Clear element and create text wrapper
  element.innerHTML = '';
  const textWrapper = document.createElement('span');
  textWrapper.className = 'text-wrapper';
  element.appendChild(textWrapper);
  
  isTyping = true;
  let i = 0;
  
  function typeChar() {
    if (i < text.length) {
      // Add the next character
      textWrapper.textContent = text.substring(0, i + 1);
      
      // Add cursor character after the text
      textWrapper.innerHTML = textWrapper.textContent + 
        '<span class="cursor">♥</span>'; 
      
      i++;
      
      // Much slower, more deliberate typing with natural pauses
      let nextSpeed;
      
      // Pause longer at punctuation and spaces
      const currentChar = text.charAt(i - 1);
      if (currentChar === '.' || currentChar === '!' || currentChar === '?') {
        nextSpeed = speed * 3; // Long pause after sentences
      } else if (currentChar === ',' || currentChar === ';' || currentChar === ':') {
        nextSpeed = speed * 2; // Medium pause
      } else if (currentChar === ' ') {
        nextSpeed = speed * 1.5; // Slight pause at spaces
      } else {
        // Variable speed for regular characters
        nextSpeed = speed + (Math.random() * 80 - 40); // More variation
      }
        
      // Add occasional longer pauses for dramatic effect
      if (i % Math.floor(Math.random() * 10 + 15) === 0) {
        nextSpeed = speed * 4;
      }
      
      currentTypingTimeout = setTimeout(typeChar, nextSpeed);
    } else {
      isTyping = false;
      
      // Keep the cursor blinking at the end
      // The cursor is already in the HTML from the last iteration
      
      // Add final flourish
      if (callback) {
        setTimeout(callback, 800); // Longer pause before author appears
      }
    }
  }
  
  // Start with a slight delay for anticipation
  setTimeout(typeChar, 500); // Longer initial delay
}

function typeQuote(quote, author) {
  // Stop any existing typing
  if (currentTypingTimeout) {
    clearTimeout(currentTypingTimeout);
    isTyping = false;
  }
  
  // Get the quote elements
  const quoteText = document.getElementById('currentQuote');
  const quoteAuthor = document.getElementById('currentAuthor');
  const ipodQuoteText = document.querySelector('.ipod-quote-text');
  const ipodQuoteAuthor = document.querySelector('.ipod-quote-author');
  
  if (!quoteText || !quoteAuthor) return;
  
  // Type the quote SLOWLY and elegantly
  typeText(quoteText, `"${quote}"`, 140, () => {
    // After quote is typed, type the author with a nice pause
    setTimeout(() => {
      typeText(quoteAuthor, `- ${author}`, 160); // Even slower for author
    }, 1000); // Longer pause between quote and author
  });
  
  // Also update iPod screen if in quotes mode
  if (isMobileView && isQuotesMode && ipodQuoteText && ipodQuoteAuthor) {
    typeText(ipodQuoteText, `"${quote}"`, 140, () => {
      setTimeout(() => {
        typeText(ipodQuoteAuthor, `- ${author}`, 160);
      }, 1000);
    });
  }
}




// ====== VIDEO BACKGROUND ======
let bgVideo;

function initBackgroundVideo() {
  bgVideo = document.getElementById('bgVideo');
  if (!bgVideo) {
    console.error("Background video element not found!");
    return;
  }
  
  // Set video properties
  bgVideo.autoplay = true;
  bgVideo.muted = true;
  bgVideo.loop = true;
  bgVideo.playsInline = true;
  bgVideo.preload = "auto";
  
  // Force mute (some browsers require this)
  bgVideo.muted = true;
  bgVideo.volume = 0;
  
  
  // Sync with current theme
  syncVideoWithTheme();
  
  // Handle autoplay restrictions
  document.addEventListener('click', function initVideoOnInteraction() {
    if (document.body.dataset.theme === "dark" && bgVideo.paused) {
      bgVideo.play().then(() => {
      }).catch(e => {
      });
    }
    document.removeEventListener('click', initVideoOnInteraction);
  }, { once: true });
}

function syncVideoWithTheme() {
  const videoBackground = document.getElementById('videoBackground');
  if (!videoBackground || !bgVideo) return;
  
  const isDark = document.body.dataset.theme === "dark";
  
  
  if (isDark) {
    // DARK THEME - SHOW and PLAY video
    videoBackground.classList.remove('video-hidden');
    videoBackground.classList.add('video-visible');
    
    // Small delay to ensure container is visible
    setTimeout(() => {
      bgVideo.play().then(() => {
      }).catch(error => {
        // Try again with user gesture
        videoBackground.addEventListener('click', function playOnce() {
          bgVideo.play();
          videoBackground.removeEventListener('click', playOnce);
        }, { once: true });
      });
    }, 200);
  } else {
    // LIGHT THEME - HIDE and PAUSE video
    videoBackground.classList.add('video-hidden');
    videoBackground.classList.remove('video-visible');
    bgVideo.pause();
    bgVideo.currentTime = 0; // Reset to beginning for next play
  }
}


    // ====== THEME FUNCTIONS ======
function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme');
  
  // Toggle theme
  const newTheme = currentTheme === "dark" ? "" : "dark";
  document.body.setAttribute('data-theme', newTheme);
  
  savePlayerState();
  updateThemeIcon();
  syncVideoWithTheme();
}

function updateThemeIcon() {
  const themeToggleIpod = document.getElementById('themeToggleIpod');
  if (!themeToggleIpod) return;
  
  const icon = themeToggleIpod.querySelector('.theme-icon i');
  const isDark = document.body.dataset.theme === "dark";
  
  
  if (isDark) {
    icon.className = 'fas fa-moon'; // Moon for dark theme
  } else {
    icon.className = 'fas fa-sun'; // Sun for light theme
  }
}

    // ====== POWER TOGGLE FUNCTION ======
    function togglePower() {
      const powerSwitch = document.getElementById('powerSwitch');
      const ipod = document.querySelector('.ipod');
      
      if (isPowerOn) {
        powerSwitch.classList.remove('on');
        powerSwitch.classList.add('off');
        ipod.classList.add('off');
        isPowerOn = false;
        disableControls();
        
        // Also pause audio
        if (audioPlayer) {
          audioPlayer.pause();
        }
      } else {
        powerSwitch.classList.remove('off');
        powerSwitch.classList.add('on');
        ipod.classList.remove('off');
        isPowerOn = true;
        enableControls();
        
        // Add a subtle animation to show it's turning on
        ipod.style.transform = 'scale(1.02)';
        setTimeout(() => {
          ipod.style.transform = 'scale(1)';
        }, 200);
      }

       savePlayerState()
    }

    // ====== RESPONSIVE LAYOUT MANAGEMENT ======
    function checkMobileView() {
      const wasMobile = isMobileView;
      isMobileView = window.innerWidth <= 768;
      
      if (wasMobile !== isMobileView) {
        handleViewChange();
      }
    }

    function handleViewChange() {
      if (isMobileView) {
        createMobileElements();
      } else {
        removeMobileElements();
        resetQuotesMode();
      }
    }

    function createMobileElements() {
      // Create the greeting element on iPod
      const ipodGreeting = document.createElement('div');
      ipodGreeting.className = 'ipod-greeting';
      ipodGreeting.textContent = 'I love you';
      document.querySelector('.ipod').appendChild(ipodGreeting);
      
      // Create the quotes toggle button - ONLY ON MOBILE
      const quotesToggleBtn = document.createElement('button');
      quotesToggleBtn.className = 'quotes-toggle-btn';
      quotesToggleBtn.id = 'quotesToggleBtn';
      quotesToggleBtn.innerHTML = '<i class="fas fa-quote-right"></i>';
      quotesToggleBtn.title = 'Toggle Quotes Mode';
      document.querySelector('.ipod').appendChild(quotesToggleBtn);
      
      // Add event listener
      quotesToggleBtn.addEventListener('click', toggleQuotesMode);
    }

    function removeMobileElements() {
      const ipodGreeting = document.querySelector('.ipod-greeting');
      if (ipodGreeting) {
        ipodGreeting.remove();
      }
      
      const quotesToggleBtn = document.getElementById('quotesToggleBtn');
      if (quotesToggleBtn) {
        quotesToggleBtn.remove();
      }
    }

    function resetQuotesMode() {
      if (isQuotesMode) {
        isQuotesMode = false;
        const ipod = document.querySelector('.ipod');
        if (ipod) {
          ipod.classList.remove('quote-mode');
        }
        updateSongDisplay();
      }
    }

    // ====== QUOTES MODE ======
function toggleQuotesMode() {
  if (!isMobileView) return;
  
  const ipod = document.querySelector('.ipod');
  const quotesToggleBtn = document.getElementById('quotesToggleBtn');
  
  isQuotesMode = !isQuotesMode;
  
  if (isQuotesMode) {
    ipod.classList.add('quote-mode');
    if (quotesToggleBtn) {
      quotesToggleBtn.innerHTML = '<i class="fas fa-music"></i>';
    }
    
    // Type the quote on mobile
      const idx = getCurrentSongIndex();
      if (idx === -1) return;

      const song = getTrackByDisplayIndex(idx);
      showQuoteInScreen();
    
    // Trigger typing animation after a short delay
    setTimeout(() => {
      const ipodQuoteText = document.querySelector('.ipod-quote-text');
      const ipodQuoteAuthor = document.querySelector('.ipod-quote-author');
      
      if (ipodQuoteText && ipodQuoteAuthor) {
        ipodQuoteText.innerHTML = '<span style="color: rgba(11, 1, 38, 0.5)">Typing...</span>';
        ipodQuoteAuthor.innerHTML = '';
        
        setTimeout(() => {
          typeText(ipodQuoteText, `"${song.quote}"`, 40, () => {
            setTimeout(() => {
              typeText(ipodQuoteAuthor, `- ${song.quoteAuthor}`, 60);
            }, 300);
          });
        }, 300);
      }
    }, 100);
    
  } else {
    ipod.classList.remove('quote-mode');
    if (quotesToggleBtn) {
      quotesToggleBtn.innerHTML = '<i class="fas fa-quote-right"></i>';
    }
    
    showSongInfoInScreen();
  }
}

function showQuoteInScreen() {
  const screenContent = document.querySelector('.screen-content');
  if (!screenContent) return;

  // Ensure necessary elements exist and reuse them
  ensureScreenElements();

  // Hide song-info, show quote areas
  const songInfo = screenContent.querySelector('.song-info');
  if (songInfo) songInfo.style.display = 'none';

  const ipodQuoteText = screenContent.querySelector('.ipod-quote-text');
  const ipodQuoteAuthor = screenContent.querySelector('.ipod-quote-author');
  if (ipodQuoteText) {
    ipodQuoteText.style.display = '';
    ipodQuoteText.textContent = 'Typing...';
  }
  if (ipodQuoteAuthor) {
    ipodQuoteAuthor.style.display = '';
    ipodQuoteAuthor.textContent = '';
  }
}

    function showSongInfoInScreen() {
      const screenContent = document.querySelector('.screen-content');
      if (!screenContent) return;

      ensureScreenElements();

      // When showing song info, ensure quote areas are hidden
      const idx = getCurrentSongIndex();
      if (idx === -1) return;
      const song = getTrackByDisplayIndex(idx);
      const songInfo = screenContent.querySelector('.song-info');
      if (!songInfo) return;
      const ipodQuoteText = screenContent.querySelector('.ipod-quote-text');
      const ipodQuoteAuthor = screenContent.querySelector('.ipod-quote-author');
      if (ipodQuoteText) { ipodQuoteText.style.display = 'none'; ipodQuoteText.textContent = ''; }
      if (ipodQuoteAuthor) { ipodQuoteAuthor.style.display = 'none'; ipodQuoteAuthor.textContent = ''; }
      songInfo.style.display = '';

      // Update fields without replacing the container
      let titleEl = songInfo.querySelector('.song-title');
      let artistEl = songInfo.querySelector('.song-artist');
      if (!titleEl) {
        titleEl = document.createElement('div');
        titleEl.className = 'song-title';
        songInfo.appendChild(titleEl);
      }
      if (!artistEl) {
        artistEl = document.createElement('div');
        artistEl.className = 'song-artist';
        songInfo.appendChild(artistEl);
      }
      titleEl.textContent = song.title;
      artistEl.textContent = song.artist;

      // Ensure progress/time elements exist
      let progressContainer = songInfo.querySelector('.progress-container');
      if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        progressContainer.innerHTML = `
          <div class="progress-bar" id="progressBarContainer">
            <div class="progress" id="progressBar"></div>
          </div>
          <div class="time-info">
            <span id="currentTime">${formatTime(currentTime)}</span>
            <span id="totalTime">${formatTime(totalTime)}</span>
          </div>`;
        songInfo.appendChild(progressContainer);
      } else {
        const currentTimeEl = progressContainer.querySelector('#currentTime');
        const totalTimeEl = progressContainer.querySelector('#totalTime');
        if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
        if (totalTimeEl) totalTimeEl.textContent = formatTime(totalTime);
      }

      // Re-attach progress bar event safely
      const progressBarContainer = document.getElementById('progressBarContainer');
      if (progressBarContainer && !progressBarContainer._handlerAttached) {
        progressBarContainer.addEventListener('click', handleProgressBarClick);
        progressBarContainer._handlerAttached = true;
      }
    }

    // Ensure screen-content has stable child elements to avoid accidental removal
    function ensureScreenElements() {
      const screenContent = document.querySelector('.screen-content');
      if (!screenContent) return;

      // song-info
      let songInfo = screenContent.querySelector('.song-info');
      if (!songInfo) {
        songInfo = document.createElement('div');
        songInfo.className = 'song-info';
        screenContent.insertBefore(songInfo, screenContent.firstChild);
      }

      // ipod-quote-text
      let ipodQuoteText = screenContent.querySelector('.ipod-quote-text');
      if (!ipodQuoteText) {
        ipodQuoteText = document.createElement('div');
        ipodQuoteText.className = 'ipod-quote-text';
        ipodQuoteText.style.padding = '20px';
        screenContent.appendChild(ipodQuoteText);
      }

      // ipod-quote-author
      let ipodQuoteAuthor = screenContent.querySelector('.ipod-quote-author');
      if (!ipodQuoteAuthor) {
        ipodQuoteAuthor = document.createElement('div');
        ipodQuoteAuthor.className = 'ipod-quote-author';
        screenContent.appendChild(ipodQuoteAuthor);
      }

      // Default visibility: show song info, hide quotes
      if (songInfo) songInfo.style.display = '';
      if (ipodQuoteText) {
        ipodQuoteText.style.display = 'none';
        ipodQuoteText.textContent = '';
      }
      if (ipodQuoteAuthor) {
        ipodQuoteAuthor.style.display = 'none';
        ipodQuoteAuthor.textContent = '';
      }
    }

    // Centralized audio listeners (attach once)
    function sendPreferredMusicToSW(url) {
      try {
        if (!isPowerOn) return;
        if (!url) return;
        if (url === lastSentPreferredMusicUrl) return; // dedupe
        lastSentPreferredMusicUrl = url;
        const msg = { type: 'set-preferred-music', url };
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(msg);
        } else if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(reg => { if (reg.active) reg.active.postMessage(msg); }).catch(()=>{});
        }
      } catch (e) {}
    }



    // ====== AUDIO FUNCTIONS ======
    function getAudioDuration(audioUrl, callback) {
      if (audioDurations[audioUrl]) {
        callback(audioDurations[audioUrl]);
        return;
      }
      
      const tempAudio = new Audio();
      tempAudio.preload = 'metadata';
      tempAudio.src = audioUrl;
      
      tempAudio.addEventListener('loadedmetadata', function() {
        const duration = Math.floor(tempAudio.duration);
        audioDurations[audioUrl] = duration;
        callback(duration);
      });
      
      tempAudio.addEventListener('error', function() {
        console.warn(`Could not load duration for: ${audioUrl}`);
        callback(0);
      });
    }

    function preloadAudioDurations() {
      originalLibrary.forEach((song, index) => {
        if (!audioDurations[song.audioUrl]) {
          getAudioDuration(song.audioUrl, (duration) => {
            // If the current display index maps to this original index, update
            const displayIdx = findDisplayIndexByTrackId(song.audioUrl);
            if (song.audioUrl === currentTrackId && totalTime === 0) {
              totalTime = duration;
              updateTotalTimeDisplay();
            }
          });
        }
      });
    }

    // ====== PLAYER FUNCTIONS ======
    function formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function enableControls() {
      const centerBtn = document.getElementById('centerBtn');
      const prevBtn = document.getElementById('prevBtn');
      const nextBtn = document.getElementById('nextBtn');
      const shuffleBtn = document.getElementById('shuffleBtn');
      const progressBarContainer = document.getElementById('progressBarContainer');
      
      if (centerBtn) centerBtn.style.opacity = "1";
      if (prevBtn) prevBtn.style.opacity = "1";
      if (nextBtn) nextBtn.style.opacity = "1";
      if (shuffleBtn) shuffleBtn.style.opacity = "1";
      if (progressBarContainer) progressBarContainer.style.cursor = "pointer";
      cards.forEach(card => card.style.cursor = "pointer");
    }

    function disableControls() {
      const centerBtn = document.getElementById('centerBtn');
      const prevBtn = document.getElementById('prevBtn');
      const nextBtn = document.getElementById('nextBtn');
      const shuffleBtn = document.getElementById('shuffleBtn');
      const progressBarContainer = document.getElementById('progressBarContainer');
      
      if (centerBtn) centerBtn.style.opacity = "0.5";
      if (prevBtn) prevBtn.style.opacity = "0.5";
      if (nextBtn) nextBtn.style.opacity = "0.5";
      if (shuffleBtn) shuffleBtn.style.opacity = "0.5";
      if (progressBarContainer) progressBarContainer.style.cursor = "not-allowed";
      cards.forEach(card => card.style.cursor = "not-allowed");
      
      if (isPlaying) {
        pauseSong();
      }
    }

    function playSong(force = false) {
      if (!currentTrackId) return;

      const sameTrack =
        audioPlayer.src &&
        new URL(audioPlayer.src, location).pathname ===
          new URL(currentTrackId, location).pathname;

      // Already playing the same track → no-op
      if (!force && sameTrack && !audioPlayer.paused) return;

      // If same track but paused → just play
      if (!force && sameTrack && audioPlayer.paused) {
        audioPlayer.play().catch(() => {});
        return;
      }

      // If different track or force → load new track
      if (!sameTrack || force) {
        audioPlayer.pause();
        audioPlayer.src = currentTrackId;
        pendingSeekTime = currentTime;
        audioPlayer.load();
      }

      // Play the track
      audioPlayer.play().catch(() => {});
    }



    // Centralized track switcher
    function setTrackById(trackId, { forcePlay = false, resetTime = true } = {}) {
      if (!trackId) return;
      if (currentTrackId === trackId && !forcePlay) return;

      currentTrackId = trackId;

      const idx = findDisplayIndexByTrackId(trackId);
      currentSongIndex = idx !== -1 ? idx : 0;

      if (resetTime) {
        currentTime = 0;
        pendingSeekTime = 0;

        if (audioPlayer) {
          audioPlayer.currentTime = 0;
        }
      }

      updateSongDisplay();
      updateQuoteFromSong();
      updateProgressBar();
      updateCardDeck();

      if (forcePlay) {
        playSong(true);
      }
    }


    function setTrack(index, options = {}) {
      const song = getTrackByDisplayIndex(index);
      if (!song) return;
      setTrackById(song.audioUrl, options);
    }



    function pauseSong() {
      audioPlayer.pause();
    }

    function nextSong() {
      const idx = getCurrentSongIndex();
      if (idx === -1) return;

      const nextIdx = (idx + 1) % displayOrder.length;
      setTrack(nextIdx, { forcePlay: true, resetTime: true });
    }

    function prevSong() {
      const idx = getCurrentSongIndex();
      if (idx === -1) return;

      const prevIdx = (idx - 1 + displayOrder.length) % displayOrder.length;
      setTrack(prevIdx, { forcePlay: true, resetTime: true });
    }


    function shuffleSongs() {
      if (!isPowerOn) return;
      // Shuffle the display order only (do not mutate originalLibrary)
      const currentlyPlayingId = currentTrackId;
      const newOrder = displayOrder.slice();
      for (let i = newOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
      }
      displayOrder = newOrder;

      // Keep the same track playing by finding its new display index
      const newDisplayIdx = findDisplayIndexByTrackId(currentlyPlayingId);
      const targetIdx = newDisplayIdx !== -1 ? newDisplayIdx : 0;

      // Use setTrack: if we were playing, continue playing; otherwise just update UI
      const isSame = currentlyPlayingId === currentTrackId;

        setTrack(targetIdx, {
          forcePlay: !!isPlaying,
          resetTime: !isSame
        });

      const shuffleBtn = document.getElementById('shuffleBtn');
      if (shuffleBtn) {
        shuffleBtn.style.color = 'var(--accent)';
        setTimeout(() => {
          shuffleBtn.style.color = '';
        }, 300);
      }
    }

    function handleProgressBarClick(e) {
      if (!isPowerOn) return;
      
      const rect = this.getBoundingClientRect();
      const clickPosition = (e.clientX - rect.left) / rect.width;
      
      if (audioPlayer.duration) {
        const seekTime = clickPosition * audioPlayer.duration;
        audioPlayer.currentTime = seekTime;
        currentTime = Math.floor(seekTime);
        updateProgressBar();
      }
    }

    // ====== DISPLAY FUNCTIONS ======
    function updateSongDisplay() {
      const idx = getCurrentSongIndex();
      if (idx === -1) return;
      const song = getTrackByDisplayIndex(idx);
      const songTitle = document.getElementById('songTitle');
      const songArtist = document.getElementById('songArtist');
      const screenImage = document.getElementById('screenImage');
      
      if (songTitle) songTitle.textContent = song.title;
      if (songArtist) songArtist.textContent = song.artist;
      if (screenImage) screenImage.src = song.image;
      
      // update HTML title
      document.title = `${song.title} — ${song.artist}`;
      
      if (song && !audioDurations[song.audioUrl]) {
        getAudioDuration(song.audioUrl, (duration) => {
          if (!isPlaying && totalTime === 0) {
            totalTime = duration;
            updateTotalTimeDisplay();
          }
        });
      }
      
      if (isPlaylistOpen) {
        renderPlaylist();
      }
      
      // Update quotes in iPod screen if in quotes mode
      if (isQuotesMode && isMobileView) {
        showQuoteInScreen();
      }
    }


    function updateProgressBar() {
      // Prefer using audio element values when available, but tolerate missing duration
      const hasDuration = !!(audioPlayer && audioPlayer.duration && !isNaN(audioPlayer.duration) && audioPlayer.duration > 0);
      if (audioPlayer) {
        if (typeof audioPlayer.currentTime === 'number') currentTime = Math.floor(audioPlayer.currentTime || 0);
        if (hasDuration) totalTime = Math.floor(audioPlayer.duration);
      }

      if (!hasDuration && !totalTime) return; // nothing sensible to display yet

      const progressPercent = totalTime ? (currentTime / totalTime) * 100 : 0;
      const progressBar = document.getElementById('progressBar');
      if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, progressPercent))}%`;

      const currentTimeEl = document.getElementById('currentTime');
      const totalTimeEl = document.getElementById('totalTime');
      if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
      if (totalTimeEl) totalTimeEl.textContent = formatTime(totalTime);

      // Do NOT advance via polling. Audio element's 'ended' event handles track advancement.
    }

    function updateTotalTimeDisplay() {
      const totalTimeEl = document.getElementById('totalTime');
      if (totalTimeEl) {
        totalTimeEl.textContent = formatTime(totalTime);
      }
    }

function updateQuoteFromSong() {
  const idx = getCurrentSongIndex();
  if (idx === -1) return;
  const song = getTrackByDisplayIndex(idx);
  const currentQuoteEl = document.getElementById('currentQuote');
  const currentAuthorEl = document.getElementById('currentAuthor');
  
  if (!currentQuoteEl || !currentAuthorEl) return;
  
  // Add "typing..." indicator
  currentQuoteEl.innerHTML = '<span class="typing-indicator">Typing...</span>';
  currentAuthorEl.innerHTML = '';
  
  // Start typing after a short delay
  setTimeout(() => {
    typeQuote(song.quote, song.quoteAuthor);
  }, 500);
  
  // Also update mobile iPod screen if in quotes mode
  if (isMobileView && isQuotesMode) {
    const ipodQuoteText = document.querySelector('.ipod-quote-text');
    const ipodQuoteAuthor = document.querySelector('.ipod-quote-author');
    
    if (ipodQuoteText && ipodQuoteAuthor) {
      ipodQuoteText.innerHTML = '<span class="typing-indicator">Typing...</span>';
      ipodQuoteAuthor.innerHTML = '';
      
      setTimeout(() => {
        typeText(ipodQuoteText, `"${song.quote}"`, 40, () => {
          setTimeout(() => {
            typeText(ipodQuoteAuthor, `- ${song.quoteAuthor}`, 60);
          }, 300);
        });
      }, 500);
    }
  }
}

    // ====== CARD DECK FUNCTIONS ======
    function createCardDeck() {
      const cardDeck = document.getElementById('cardDeck');
      if (!cardDeck) return;
      
      cardDeck.innerHTML = '';
      cards = [];
      displayOrder.forEach((origIdx, displayIndex) => {
        const song = originalLibrary[origIdx];
        const card = document.createElement('div');
        card.className = 'music-card';
        card.dataset.index = displayIndex;

        if (displayIndex === currentSongIndex) {
          card.classList.add('playing');
        } else {
          card.classList.add('card-back');
        }

        card.innerHTML = `
          <div class="card-front">
            <div class="card-corner top-left">${song.cardValue}</div>
            <div class="card-corner top-right">${song.cardSuit}</div>
            <img src="${song.image}" alt="${song.title}" class="card-image">
          </div>
        `;

        card.addEventListener('click', function() {
          if (!isPowerOn) return;

          const clickedIndex = parseInt(this.dataset.index);

          if (clickedIndex === currentSongIndex) {
            if (isPlaying) {
              pauseSong();
            } else {
              playSong();
            }
          } else {
            setTrack(clickedIndex, { forcePlay: true, resetTime: true });
          }
        });

        cardDeck.appendChild(card);
        cards.push(card);
      });
    }

    function updateCardDeck() {
      const currentIndex = getCurrentSongIndex();
      if (currentIndex === -1) return;

      cards.forEach((card, index) => {
        if (index === currentIndex) {
          card.classList.add('playing');
          card.classList.remove('card-back');
        } else {
          card.classList.remove('playing');
          card.classList.add('card-back');
        }
      });
    }

    // ====== PLAYLIST FUNCTIONS ======
    function openPlaylist() {
      isPlaylistOpen = true;
      const playlistScreen = document.getElementById('playlistScreen');
      if (playlistScreen) playlistScreen.style.display = 'block';
      renderPlaylist();
      
      const songInfo = document.querySelector('.song-info');
      if (songInfo) songInfo.style.opacity = '0';
    }

    function closePlaylist() {
      isPlaylistOpen = false;
      const playlistScreen = document.getElementById('playlistScreen');
      if (playlistScreen) playlistScreen.style.display = 'none';
      
      const songInfo = document.querySelector('.song-info');
      if (songInfo) songInfo.style.opacity = '1';
    }

    function renderPlaylist() {
      const playlistContainer = document.getElementById('playlistContainer');
      if (!playlistContainer) return;
      
      playlistContainer.innerHTML = '';
      let totalDuration = 0;
      const currentIndex = getCurrentSongIndex();
      displayOrder.forEach((origIdx, index) => {
        const song = originalLibrary[origIdx];
        const duration = audioDurations[song.audioUrl] || 0;
        totalDuration += duration;

        const playlistItem = document.createElement('div');
        playlistItem.className = 'playlist-item';
        if (index === currentIndex) playlistItem.classList.add('playing');
        playlistItem.dataset.index = index;

        playlistItem.innerHTML = `
          <div class="playlist-item-icon">
            <img src="${song.image}" alt="${song.title}">
          </div>
          <div class="playlist-item-info">
            <div class="playlist-item-title">${song.title}</div>
            <div class="playlist-item-artist">${song.artist}</div>
          </div>
          ${index === currentIndex 
            ? '<div class="playlist-item-playing"><i class="fas fa-volume-up"></i></div>' 
            : `<div class="playlist-item-duration">${formatTime(duration)}</div>`}
        `;

        playlistItem.addEventListener('click', function() {
          const clickedIndex = parseInt(this.dataset.index);
          const currentIndex = getCurrentSongIndex();

          if (clickedIndex === currentIndex) {
            if (isPlaying) {
              pauseSong();
            } else {
              playSong();
            }
          } else {
            setTrack(clickedIndex, { forcePlay: true, resetTime: true });
            renderPlaylist();
          }

          setTimeout(() => closePlaylist(), 500);
        });

        playlistContainer.appendChild(playlistItem);
      });
      
      const playlistCount = document.getElementById('playlistCount');
      const totalPlaylistTimeEl = document.getElementById('totalPlaylistTime');
      if (playlistCount) playlistCount.textContent = `${displayOrder.length} songs`;
      if (totalPlaylistTimeEl) totalPlaylistTimeEl.textContent = formatTime(totalDuration);
    }

    // ====== CARD REVEAL FUNCTIONS ======
    window.revealAllCards = function() {
      if (!isPowerOn) return;
      
      const cardRevealModal = document.getElementById('cardRevealModal');
      if (!cardRevealModal) return;
      
      cardRevealModal.innerHTML = '<div class="modal-close" onclick="closeReveal()">✕</div>';
      
      originalLibrary.forEach((song, index) => {
        const revealCard = document.createElement('div');
        revealCard.className = 'reveal-card';
        
        revealCard.innerHTML = `
          <img src="${song.image}" alt="${song.title}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">
        `;
        
        cardRevealModal.appendChild(revealCard);
        
        setTimeout(() => {
          revealCard.classList.add('show');
        }, index * 100);
      });
      
      cardRevealModal.classList.add('active');
      document.body.classList.add('no-scroll');
    };

    window.closeReveal = function() {
      const cardRevealModal = document.getElementById('cardRevealModal');
      if (!cardRevealModal) return;
      
      cardRevealModal.classList.remove('active');
      document.body.classList.remove('no-scroll');
      
      setTimeout(() => {
        cardRevealModal.innerHTML = '<div class="modal-close" onclick="closeReveal()">✕</div>';
      }, 400);
    };

    // ====== INITIALIZATION ======
    document.addEventListener('DOMContentLoaded', function() {
      // Get audio player
      audioPlayer = document.getElementById('audioPlayer');
      ensureScreenElements()

        // Load saved player state
      const stateLoaded = loadPlayerState();

    // Initialize background video
      initBackgroundVideo();
      
      // Theme toggle
      const themeToggleIpod = document.getElementById('themeToggleIpod');
      if (themeToggleIpod) {
        themeToggleIpod.addEventListener('click', toggleTheme);
      }
      
      
      // Check initial view
      checkMobileView();
      
      // Initialize player
  if (!stateLoaded) {
    createCardDeck();
    updateSongDisplay();
    updateProgressBar();
    setTrack(0, { forcePlay: isPowerOn, resetTime: true });
    updateQuoteFromSong();
    updateThemeIcon();
    preloadAudioDurations();
  } else {
    if (isPowerOn) {
      enableControls();
    } else {
      disableControls();
    }
  }

  setupAutoSave();

      // Ensure audio listeners are attached once
      attachAudioListenersOnce();
      
      // Power switch
      const powerSwitch = document.getElementById('powerSwitch');
      if (powerSwitch) {
        powerSwitch.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          togglePower();
          
          // Visual feedback
          this.style.transform = 'scale(0.95)';
          setTimeout(() => {
            this.style.transform = 'scale(1)';
          }, 200);
        });
      }
      
      // Control buttons
      const centerBtn = document.getElementById('centerBtn');
      if (centerBtn) {
        centerBtn.addEventListener('click', function() {
          if (!isPowerOn) return;
          if (isPlaying) pauseSong(); else playSong();
        });
      }
      
      const prevBtn = document.getElementById('prevBtn');
      if (prevBtn) {
        prevBtn.addEventListener('click', function() {
          if (!isPowerOn) return;
          prevSong();
        });
      }
      
      const nextBtn = document.getElementById('nextBtn');
      if (nextBtn) {
        nextBtn.addEventListener('click', function() {
          if (!isPowerOn) return;
          nextSong();
        });
      }
      
      const shuffleBtn = document.getElementById('shuffleBtn');
      if (shuffleBtn) {
        shuffleBtn.addEventListener('click', function() {
          if (!isPowerOn) return;
          shuffleSongs();
        });
      }
      
      // Progress bar
      const progressBarContainer = document.getElementById('progressBarContainer');
      if (progressBarContainer) {
        progressBarContainer.addEventListener('click', handleProgressBarClick);
      }
      
      // Menu button for playlist
      const menuBtn = document.getElementById('menuBtn');
      if (menuBtn) {
        menuBtn.addEventListener('click', function() {
          if (!isPowerOn) return;
          
          if (isPlaylistOpen) {
            closePlaylist();
          } else {
            openPlaylist();
          }
          
          this.style.color = 'var(--accent)';
          setTimeout(() => {
            this.style.color = '';
          }, 300);
        });
      }
      
      // Close playlist on escape
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isPlaylistOpen) {
          closePlaylist();
        }
      });
      
      // Close playlist when clicking outside
      document.addEventListener('click', function(e) {
        if (!isPlaylistOpen) return;
        
        const target = e.target;
        const playlistScreen = document.getElementById('playlistScreen');
        const isClickOnPlaylist = playlistScreen && playlistScreen.contains(target);
        const isClickOnMenuBtn = target === menuBtn || (menuBtn && menuBtn.contains(target));
        const isClickOnPlaylistItem = target.closest('.playlist-item');
        
        if (!isClickOnPlaylist && !isClickOnMenuBtn && !isClickOnPlaylistItem) {
          closePlaylist();
        }
      });
      
      // audio listeners attached centrally via attachAudioListenersOnce()
      
      // Window resize handler
      let resizeTimeout;
      window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          checkMobileView();
        }, 150);
      });
    });

    // Notify service worker of preferred music (read from localStorage) and keep it updated
    (function() {
      if (!('serviceWorker' in navigator)) return;

      function postToSW(msg) {
        try {
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(msg);
          } else {
            navigator.serviceWorker.ready.then(reg => {
              if (reg.active) reg.active.postMessage(msg);
            }).catch(() => {});
          }
        } catch (e) {}
      }

      function sendPreferredFromState() {
        try {
          const saved = localStorage.getItem('musicPlayerState');
          let url = null;
          if (saved) {
            const state = JSON.parse(saved);
            if (state.currentTrackId) url = state.currentTrackId;
            if (state.displayOrder && isValidDisplayOrder(state.displayOrder)) {
              // restore displayOrder in memory as best-effort
              displayOrder = state.displayOrder.slice();
            }
          }
          // fallback to first track if nothing saved
          if (!url && originalLibrary && originalLibrary[0]) url = originalLibrary[0].audioUrl;
          if (url) sendPreferredMusicToSW(url);
        } catch (e) {}
      }

      // Try sending once after initialization
      setTimeout(sendPreferredFromState, 900);

      // When the SW controller changes (new SW), resend preferred
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setTimeout(sendPreferredFromState, 500);
      });
    })();