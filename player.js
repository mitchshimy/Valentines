    // ====== GLOBAL VARIABLES ======
    let youtubePlayer;
    let audioPlayer;
    let isPlaying = false;
    let isPowerOn = true;
    let currentSongIndex = 0;
    let currentTime = 0;
    let totalTime = 0;
    let playInterval = null;
    let cards = [];
    let audioDurations = {};
    let isPlaylistOpen = false;
    let isQuotesMode = false;
    let isMobileView = false;

    // Music Library
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
        title: "With You",
        artist: "Chris Brown",
        audioUrl: "assets/music/withyou.mp3",
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
    ];

  // ====== LOCAL STORAGE FUNCTIONS ======
function savePlayerState() {
  const playerState = {
    currentSongIndex: currentSongIndex,
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
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      
      // Load theme first (before anything else)
      if (state.theme !== undefined) {
        document.body.setAttribute('data-theme', state.theme);
        updateThemeIcon();
      } 
      
      // LOAD POWER STATE - ADD THIS SECTION
      if (state.isPowerOn !== undefined) {
        isPowerOn = state.isPowerOn;
        
        // Update power switch visual state
        const powerSwitch = document.getElementById('powerSwitch');
        const ipod = document.querySelector('.ipod');
        
        if (powerSwitch && ipod) {
          if (isPowerOn) {
            powerSwitch.classList.remove('off');
            powerSwitch.classList.add('on');
            ipod.classList.remove('off');
          } else {
            powerSwitch.classList.remove('on');
            powerSwitch.classList.add('off');
            ipod.classList.add('off');
          }
        }
      }
      
      // Load song position
      if (state.currentSongIndex !== undefined) {
        currentSongIndex = state.currentSongIndex;
        currentTime = state.currentTime || 0;
        
        // Update display immediately
        updateSongDisplay();
        createCardDeck();
        updateQuoteFromSong();
        
        // Load the audio
        const song = musicLibrary[currentSongIndex];
        if (song) {
          audioPlayer.src = song.audioUrl;
          
          // Set playback position
          audioPlayer.addEventListener('loadedmetadata', function onLoad() {
            if (currentTime < audioPlayer.duration) {
              audioPlayer.currentTime = currentTime;
            }
            
            // Restore playback state - MODIFIED TO CHECK isPowerOn
            if (state.isPlaying && isPowerOn) {
              setTimeout(() => {
                playSong();
              }, 500);
            }
            
            audioPlayer.removeEventListener('loadedmetadata', onLoad);
          }, { once: true });
          
          // Update progress bar immediately
          updateProgressBar();
        }
      }
      
      // Restore volume
      if (state.volume && audioPlayer) {
        audioPlayer.volume = state.volume;
      }

      if (isPowerOn) {
      // Wait a bit for everything to load, then try to play
      setTimeout(() => {
        forceAutoplay();
      }, 1000);
    }
      
      return true;
    } catch (error) {
      console.error("Error loading player state:", error);
      return false;
    }
  }
  return false;
}

function forceAutoplay() {
  if (!isPowerOn) return;
  
  // Set current song and time from saved state if available
  const savedState = localStorage.getItem('musicPlayerState');
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      if (state.currentSongIndex !== undefined) {
        currentSongIndex = state.currentSongIndex;
        currentTime = state.currentTime || 0;
        updateSongDisplay();
        createCardDeck();
        updateQuoteFromSong();
        
        const song = musicLibrary[currentSongIndex];
        if (song) {
          audioPlayer.src = song.audioUrl;
        }
      }
    } catch (error) {
      console.error("Error loading saved state for autoplay:", error);
    }
  }
  
  // Force play regardless of previous state
  const playPromise = audioPlayer.play();
  
  if (playPromise !== undefined) {
    playPromise.then(() => {
      isPlaying = true;
      const playIcon = document.getElementById('playIcon');
      if (playIcon) playIcon.className = 'fas fa-pause';
      
      clearInterval(playInterval);
      playInterval = setInterval(updateProgressBar, 1000);
      savePlayerState();
    }).catch(error => {
      console.log("Autoplay blocked. Waiting for user interaction...");
      isPlaying = false;
      const playIcon = document.getElementById('playIcon');
      if (playIcon) playIcon.className = 'fas fa-play';
      
      // Add a click handler to start playback on first user interaction
      const startOnInteraction = () => {
        playSong();
        document.removeEventListener('click', startOnInteraction);
      };
      document.addEventListener('click', startOnInteraction, { once: true });
    });
  }
}

function clearPlayerState() {
  localStorage.removeItem('musicPlayerState');
}

// Auto-save on various events
function setupAutoSave() {
  // Save on play/pause
  audioPlayer.addEventListener('play', savePlayerState);
  audioPlayer.addEventListener('pause', savePlayerState);
  
  // Save on song change
  audioPlayer.addEventListener('ended', savePlayerState);
  
  // Save on time update (throttled)
  let saveTimeout;
  audioPlayer.addEventListener('timeupdate', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(savePlayerState, 2000); // Save every 2 seconds during playback
  });
  
  
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
    const song = musicLibrary[currentSongIndex];
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
  
  const song = musicLibrary[currentSongIndex];
  screenContent.innerHTML = `
    <div class="song-info" style="display: none;"></div>
    <div class="ipod-quote-text" style="color: rgba(11,1,38 0.9); font-family: 'Source Code Pro', monospace; text-align: left; padding: 20px;">Typing...</div>
    <div class="ipod-quote-author" style="color: rgba(0, 255, 128, 0.8); font-family: 'Source Code Pro', monospace; text-align: left; padding: 0 20px;"></div>
  `;
}

    function showSongInfoInScreen() {
      const screenContent = document.querySelector('.screen-content');
      if (!screenContent) return;
      
      const song = musicLibrary[currentSongIndex];
      screenContent.innerHTML = `
        <div class="song-info">
          <div class="song-title">${song.title}</div>
          <div class="song-artist">${song.artist}</div>
          
          <div class="progress-container">
            <div class="progress-bar" id="progressBarContainer">
              <div class="progress" id="progressBar"></div>
            </div>
            <div class="time-info">
              <span id="currentTime">${formatTime(currentTime)}</span>
              <span id="totalTime">${formatTime(totalTime)}</span>
            </div>
          </div>
        </div>
      `;
      
      // Re-attach progress bar event
      const progressBarContainer = document.getElementById('progressBarContainer');
      if (progressBarContainer) {
        progressBarContainer.addEventListener('click', handleProgressBarClick);
      }
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
      musicLibrary.forEach((song, index) => {
        if (!audioDurations[song.audioUrl]) {
          getAudioDuration(song.audioUrl, (duration) => {
            if (index === currentSongIndex && totalTime === 0) {
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

    function playSong() {
      const song = musicLibrary[currentSongIndex];
      
      if (isPlaying && audioPlayer.src.includes(song.audioUrl)) {
        return;
      }
      
      audioPlayer.src = song.audioUrl;
      
      audioPlayer.addEventListener('loadedmetadata', function onMetadataLoad() {
        totalTime = Math.floor(audioPlayer.duration);
        updateTotalTimeDisplay();
        audioPlayer.removeEventListener('loadedmetadata', onMetadataLoad);
      }, { once: true });
      
      audioPlayer.currentTime = currentTime;
      
      audioPlayer.play().then(() => {
        isPlaying = true;
        const playIcon = document.getElementById('playIcon');
        if (playIcon) playIcon.className = 'fas fa-pause';
        
        clearInterval(playInterval);
        playInterval = setInterval(updateProgressBar, 1000);
        savePlayerState()
      }).catch(error => {
        console.error("Audio playback failed:", error);
        isPlaying = false;
        const playIcon = document.getElementById('playIcon');
        if (playIcon) playIcon.className = 'fas fa-play';
      });
    }

    function pauseSong() {
      audioPlayer.pause();
      isPlaying = false;
      const playIcon = document.getElementById('playIcon');
      if (playIcon) playIcon.className = 'fas fa-play';
      clearInterval(playInterval);
      savePlayerState()
    }

    function nextSong() {
      currentSongIndex = (currentSongIndex + 1) % musicLibrary.length;
      currentTime = 0;
      updateSongDisplay();
      updateCardDeck();
      updateQuoteFromSong();
      
      const totalTimeEl = document.getElementById('totalTime');
      if (totalTimeEl) totalTimeEl.textContent = '0:00';
      
      const nextSong = musicLibrary[currentSongIndex];
      getAudioDuration(nextSong.audioUrl, (duration) => {
        if (!isPlaying) {
          updateTotalTimeDisplay();
        }
      });
      
      playSong();
      
      if (isPlaylistOpen) {
        renderPlaylist();
      }

      savePlayerState()
    }

    function prevSong() {
      currentSongIndex = (currentSongIndex - 1 + musicLibrary.length) % musicLibrary.length;
      currentTime = 0;
      updateSongDisplay();
      updateCardDeck();
      updateQuoteFromSong();
      
      const totalTimeEl = document.getElementById('totalTime');
      if (totalTimeEl) {
        totalTimeEl.textContent = '0:00';
        totalTimeEl.classList.add('loading');
      }
      
      const prevSong = musicLibrary[currentSongIndex];
      getAudioDuration(prevSong.audioUrl, (duration) => {
        if (totalTimeEl) totalTimeEl.classList.remove('loading');
        if (!isPlaying) {
          updateTotalTimeDisplay();
        }
      });
      
      playSong();
      
      if (isPlaylistOpen) {
        renderPlaylist();
      }
      savePlayerState()
    }

    function shuffleSongs() {
      if (!isPowerOn) return;
      
      const currentSong = musicLibrary[currentSongIndex];
      const shuffledLibrary = [...musicLibrary];
      
      for (let i = shuffledLibrary.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledLibrary[i], shuffledLibrary[j]] = [shuffledLibrary[j], shuffledLibrary[i]];
      }
      
      const newIndex = shuffledLibrary.findIndex(song => 
        song.title === currentSong.title && song.artist === currentSong.artist
      );
      
      currentSongIndex = newIndex !== -1 ? newIndex : 0;
      musicLibrary.length = 0;
      musicLibrary.push(...shuffledLibrary);
      
      currentTime = 0;
      totalTime = musicLibrary[currentSongIndex].duration;
      
      updateSongDisplay();
      createCardDeck();
      updateProgressBar();
      updateQuoteFromSong();
      
      if (isPlaying) {
        playSong();
      }
      
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
      const song = musicLibrary[currentSongIndex];
      const songTitle = document.getElementById('songTitle');
      const songArtist = document.getElementById('songArtist');
      const screenImage = document.getElementById('screenImage');
      
      if (songTitle) songTitle.textContent = song.title;
      if (songArtist) songArtist.textContent = song.artist;
      if (screenImage) screenImage.src = song.image;
      
      if (!audioDurations[song.audioUrl]) {
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
      if (audioPlayer.duration) {
        currentTime = Math.floor(audioPlayer.currentTime);
        totalTime = Math.floor(audioPlayer.duration);
        
        const progressPercent = (currentTime / totalTime) * 100;
        const progressBar = document.getElementById('progressBar');
        if (progressBar) progressBar.style.width = `${progressPercent}%`;
        
        const currentTimeEl = document.getElementById('currentTime');
        const totalTimeEl = document.getElementById('totalTime');
        if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
        if (totalTimeEl) totalTimeEl.textContent = formatTime(totalTime);
        
        if (currentTime >= totalTime && isPlaying) {
          nextSong();
        }
      }
    }

    function updateTotalTimeDisplay() {
      const totalTimeEl = document.getElementById('totalTime');
      if (totalTimeEl) {
        totalTimeEl.textContent = formatTime(totalTime);
      }
    }

function updateQuoteFromSong() {
  const song = musicLibrary[currentSongIndex];
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
      
      musicLibrary.forEach((song, index) => {
        const card = document.createElement('div');
        card.className = 'music-card';
        card.dataset.index = index;
        
        if (index === currentSongIndex) {
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
            currentSongIndex = clickedIndex;
            currentTime = 0;
            totalTime = musicLibrary[currentSongIndex].duration;
            updateSongDisplay();
            updateCardDeck();
            updateQuoteFromSong();
            playSong();
          }
        });
        
        cardDeck.appendChild(card);
        cards.push(card);
      });
    }

    function updateCardDeck() {
      cards.forEach((card, index) => {
        if (index === currentSongIndex) {
          card.classList.add('playing');
          card.classList.remove('card-back');
        } else {
          card.classList.remove('playing');
          if (!card.classList.contains('card-back')) {
            card.classList.add('card-back');
          }
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
      
      musicLibrary.forEach((song, index) => {
        const duration = audioDurations[song.audioUrl] || 0;
        totalDuration += duration;
        
        const playlistItem = document.createElement('div');
        playlistItem.className = 'playlist-item';
        if (index === currentSongIndex) playlistItem.classList.add('playing');
        playlistItem.dataset.index = index;
        
        playlistItem.innerHTML = `
          <div class="playlist-item-icon">
            <img src="${song.image}" alt="${song.title}">
          </div>
          <div class="playlist-item-info">
            <div class="playlist-item-title">${song.title}</div>
            <div class="playlist-item-artist">${song.artist}</div>
          </div>
          ${index === currentSongIndex 
            ? '<div class="playlist-item-playing"><i class="fas fa-volume-up"></i></div>' 
            : `<div class="playlist-item-duration">${formatTime(duration)}</div>`}
        `;
        
        playlistItem.addEventListener('click', function() {
          const clickedIndex = parseInt(this.dataset.index);
          
          if (clickedIndex === currentSongIndex) {
            if (isPlaying) {
              pauseSong();
            } else {
              playSong();
            }
          } else {
            currentSongIndex = clickedIndex;
            currentTime = 0;
            updateSongDisplay();
            updateCardDeck();
            updateQuoteFromSong();
            playSong();
            renderPlaylist();
          }
          
          setTimeout(() => closePlaylist(), 500);
        });
        
        playlistContainer.appendChild(playlistItem);
      });
      
      const playlistCount = document.getElementById('playlistCount');
      const totalPlaylistTimeEl = document.getElementById('totalPlaylistTime');
      if (playlistCount) playlistCount.textContent = `${musicLibrary.length} songs`;
      if (totalPlaylistTimeEl) totalPlaylistTimeEl.textContent = formatTime(totalDuration);
    }

    // ====== CARD REVEAL FUNCTIONS ======
    window.revealAllCards = function() {
      if (!isPowerOn) return;
      
      const cardRevealModal = document.getElementById('cardRevealModal');
      if (!cardRevealModal) return;
      
      cardRevealModal.innerHTML = '<div class="modal-close" onclick="closeReveal()">✕</div>';
      
      musicLibrary.forEach((song, index) => {
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
      
      // Audio event listeners
      audioPlayer.addEventListener('loadedmetadata', function() {
        totalTime = Math.floor(audioPlayer.duration);
        updateTotalTimeDisplay();
      });
      
      audioPlayer.addEventListener('ended', function() {
        if (isPlaying) {
          nextSong();
        }
      });
      
audioPlayer.addEventListener('error', function(e) {
  console.error("Audio error:", audioPlayer.error);
  
  // Try to recover by moving to next song
  if (currentSongIndex < musicLibrary.length - 1) {
    currentSongIndex++;
    currentTime = 0;
    updateSongDisplay();
    updateCardDeck();
    updateQuoteFromSong();
    
    // Try playing next song
    setTimeout(() => {
      playSong();
    }, 1000);
  }
  
  // Save error state
  savePlayerState();
});
      
      // Window resize handler
      let resizeTimeout;
      window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          checkMobileView();
        }, 150);
      });
    });