let currentTypingTimeout = null;
let isTyping = false;
let letterTypingComplete = false;



// Helper to communicate with the service worker
function sendMessageToSW(message) {
    if (!('serviceWorker' in navigator)) return;
    try {
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(message);
        } else {
            navigator.serviceWorker.ready
                .then(reg => reg.active && reg.active.postMessage(message))
                .catch(() => {});
        }
    } catch (_) {}
}

function prefetchPlayerAssets() {
    // All assets for the player
    const assets = [
        // Music (highest priority)
        'assets/music/chikwere.mp3',
        'assets/music/noonelikeyou.mp3',
        'assets/music/itsyou.mp3',
        'assets/music/happyyouremine.mp3',
        'assets/music/feelmylove.mp3',
        'assets/music/littlethings.mp3',
        'assets/music/feelthelove.mp3',
        'assets/music/residuals.mp3',
        'assets/music/najuta.mp3',

        // Player visuals (images/videos)
        'assets/images/1.jpg',
        'assets/images/2.jpg',
        'assets/images/3.jpg',
        'assets/images/4.jpg',
        'assets/images/5.jpg',
        'assets/images/6.jpg',
        'assets/images/7.jpg',
        'assets/images/8.jpg',
        'assets/images/9.jpg',
        'assets/images/background.png',
        'assets/images/background-dark.mp4'
    ];

    // Send all assets to service worker for prioritized caching
    sendMessageToSW({ type: 'prefetch', assets });
}

// --- UTILITY FUNCTIONS ---

// Create and append a cursor
function createCursor(element) {
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    cursor.textContent = '|';
    element.appendChild(cursor);
    return cursor;
}

// Scroll element to bottom if overflowing
function scrollIfOverflow(element) {
    if (element.scrollHeight > element.clientHeight) {
        element.scrollTop = element.scrollHeight;
    }
}

// Calculate dynamic typing speed
function calculateSpeed(char, baseSpeed, charIndex) {
    let speed = baseSpeed;

    if (['.', '!', '?'].includes(char)) speed *= 4;
    else if ([',', ';'].includes(char)) speed *= 2.5;
    else if (char === ':') speed *= 2;
    else if (char === ' ') speed *= 1.3;

    // Random variation
    speed += Math.random() * 40 - 20;

    // Occasional dramatic pause
    if (charIndex > 5 && charIndex % Math.floor(Math.random() * 12 + 10) === 0) {
        speed = baseSpeed * 3;
    }

    return Math.max(50, speed);
}

// --- TYPING FUNCTION ---
function typeText(element, html, baseSpeed = 120, callback = null) {
    if (currentTypingTimeout) clearTimeout(currentTypingTimeout);
    element.innerHTML = '';

    // Parse HTML into tokens (text vs tags)
    const tokens = [];
    let textBuffer = '', inTag = false, tagBuffer = '';

    for (const char of html) {
        if (char === '<') {
            if (textBuffer) { tokens.push({ type: 'text', content: textBuffer }); textBuffer = ''; }
            inTag = true; tagBuffer = char;
        } else if (char === '>') {
            tagBuffer += char;
            tokens.push({ type: 'tag', content: tagBuffer });
            inTag = false; tagBuffer = '';
        } else if (inTag) tagBuffer += char;
        else textBuffer += char;
    }
    if (textBuffer) tokens.push({ type: 'text', content: textBuffer });

    let tokenIndex = 0, charIndex = 0, output = '', cursor = null;

    function processNext() {
        if (tokenIndex >= tokens.length) {
            element.innerHTML = output;
            if (callback) setTimeout(callback, 600);
            return;
        }

        const token = tokens[tokenIndex];

        if (token.type === 'tag') {
            output += token.content;
            element.innerHTML = output;
            cursor?.remove();
            cursor = createCursor(element);
            scrollIfOverflow(element);
            tokenIndex++;
            currentTypingTimeout = setTimeout(processNext, 50);
        } else { // text
            if (charIndex < token.content.length) {
                const char = token.content[charIndex++];
                output += char;
                element.innerHTML = output;
                cursor?.remove();
                cursor = createCursor(element);
                scrollIfOverflow(element);
                currentTypingTimeout = setTimeout(processNext, calculateSpeed(char, baseSpeed, charIndex));
            } else {
                tokenIndex++; charIndex = 0;
                currentTypingTimeout = setTimeout(processNext, 50);
            }
        }
    }

    setTimeout(processNext, 200);
}

// --- LETTER ANIMATION ---
function startLetterTypingAnimation() {
    if (isTyping || letterTypingComplete) return;
    isTyping = true;

    // Tell the service worker to start background caching while the letter types
    prefetchPlayerAssets();

    const paragraphs = document.querySelectorAll('.letter-content p');
    if (!paragraphs.length) return;

    const letterTexts = [
        "A Message from Me to You,",
        "There's nothing quite like a handwritten note, but I wanted to add my own little twist to it. On this day I want to  <span> celebrate you</span>. It being Lover’s Day I wanted to show you how <span>grateful</span> I am to have you as my friend. I don’t think I say or show that enough, and this is me doing it now.",
        "I may not have gotten you physical flowers, but consider this me giving you them (These ones won’t go bad, unless there’s a code 404😅). I just want to let you know that <span>I see you</span>. I see how you try and show up every single day, how you keep going and never give up even after going through so much. That kind of <span>resilience</span> needs to be studied, and who better than our upcoming <span>Dr.Nyanza</span>.",
        "You go, girl.",
        "It’s funny how someone in such a tiny package can have everything. Disney-princess beauty, Megamind’s-mega mind (without the big head of course. We’ll discuss the forehead later😂), curves for days and a truly loving and caring heart. All combined with a pinch of wickedness that makes you a joy to be around. Whoever said a girl can’t have it all clearly never got a chance to meet <span>you</span>. You are <span>damn near the definition of perfection</span>, so never let anyone make you doubt that.",
        "I see <span>beautiful things in your future</span>, and I hope I’ll be there to witness them. I’m glad that life put you in my corner and just know that if you ever need a friend to scream with wherever and whenever <span>I’m your guy</span>. You’re stuck with me like a baby on a mother’s tit 😂",
        "And when you read this with your person, msicheke sana 😂",
        "P.S. <span>I LOVE YOU</span>",
        "Your Boy <span>Shimy</span>"
    ];

    // Clear content
    paragraphs.forEach(p => p.innerHTML = '');

    if (sessionStorage.getItem('letterViewed') === 'true') {
        paragraphs.forEach((p, i) => p.innerHTML = letterTexts[i] || '');
        isTyping = false;
        letterTypingComplete = true;
        showContinueButton();
        return;
    }

    function typeParagraph(index) {
        if (index >= paragraphs.length) {
            isTyping = false;
            letterTypingComplete = true;
            sessionStorage.setItem('letterViewed', 'true');
            showContinueButton();
            const letterContent = document.querySelector('.letter-content');
            if (letterContent.scrollHeight > letterContent.clientHeight) {
                letterContent.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
            return;
        }

        let speed = (index === 0) ? 40 : (index === paragraphs.length - 1) ? 35 : 25;

        typeText(paragraphs[index], letterTexts[index], speed, () => {
            paragraphs[index].parentElement.scrollTo({
                top: paragraphs[index].offsetTop,
                behavior: 'smooth'
            });
            setTimeout(() => typeParagraph(index + 1), 100);
        });
    }

    typeParagraph(0);
}

// --- CONTINUE BUTTON ---
function createButton({ className, containerSelector, onClick }) {
    const btn = document.createElement('button');
    btn.className = className;
    btn.innerHTML = '👀';
    btn.onclick = onClick;
    const container = document.querySelector(containerSelector);
    if (container) container.appendChild(btn);
    return btn;
}

function showContinueButton() {
    // --- LETTER BUTTON ---
    if (!document.querySelector('.continue-button')) {
        const onClick = () => {
            document.body.style.opacity = '0';
            setTimeout(() => window.location.href = 'player.html', 800);
        };

        // Letter continue button
        const letterBtn = createButton({
            className: 'continue-button',
            containerSelector: '.letter-content',
            onClick
        });
        letterBtn.style.animation = 'pulse 2s infinite';
    }

    // --- CONTENT BUTTON ---
    if (!document.querySelector('.content-continue-button')) {
        const onClick = () => {
            document.body.style.opacity = '0';
            setTimeout(() => window.location.href = 'player.html', 800);
        };

        const contentBtn = createButton({
            className: 'content-continue-button show-content-continue',
            containerSelector: '.content',
            onClick
        });

        // Remove JS inline styles that interfere with CSS animation
        contentBtn.style.opacity = '';
        contentBtn.style.transform = '';
        contentBtn.style.pointerEvents = '';
    }
}



// --- LETTER REVEAL / CLOSE ---
function revealLetter() {
    const letter = document.querySelector('.letter-image');
    letter.classList.add('show-letter');
    setTimeout(startLetterTypingAnimation, 500);
}

function closeLetter(event) {
    if (!event.target.classList.contains('wax-seal')) return;

    const letter = document.querySelector('.letter-image');
    letter.classList.remove('show-letter');

    isTyping = false;
    letterTypingComplete = false;
    if (currentTypingTimeout) clearTimeout(currentTypingTimeout);

    if (sessionStorage.getItem('letterViewed') !== 'true') {
        document.querySelectorAll('.letter-content p').forEach(p => p.innerHTML = '');
    }

    document.querySelector('.continue-button')?.remove();
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    const letter = document.querySelector('.letter-image');
    const content = document.querySelector('.letter-content');
    const seal = document.querySelector('.wax-seal');
    const contentBtn = document.querySelector('.content-continue-button');
    if (contentBtn) contentBtn.classList.add('show-content-continue');

    letter.addEventListener('click', revealLetter);
    content.addEventListener('click', e => e.stopPropagation());
    seal.addEventListener('click', closeLetter);
});
