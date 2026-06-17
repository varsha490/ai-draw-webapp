// ====== DOM Elements ======
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const loadingOverlay = document.getElementById('loading');
const colorButtons = document.querySelectorAll('.color-btn');
const clearButton = document.getElementById('clear-btn');

// Modal Elements
const welcomeModal = document.getElementById('welcome-modal-overlay');
const startBtn = document.getElementById('start-btn');

// Gesture UI Elements
const gestureDrawUI = document.getElementById('gesture-draw');
const gestureMoveUI = document.getElementById('gesture-move');
const gestureClearUI = document.getElementById('gesture-clear');

// ====== State Variables ======
let drawing = false; // Specifically tracking drawing state
let currentPath = [];
let allPaths = [];
let currentColor = '#ff3366'; // Default starting color
const strokeWidth = 8;
let prevX = 0;
let prevY = 0;

// ====== UI Event Listeners ======
colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        colorButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentColor = btn.getAttribute('data-color');
    });
});

clearButton.addEventListener('click', () => {
    allPaths = [];
    currentPath = [];
});

function setActiveGestureUI(gestureMsg) {
    gestureDrawUI.classList.remove('active');
    gestureMoveUI.classList.remove('active');
    gestureClearUI.classList.remove('active');

    if (gestureMsg === 'DRAW') {
        gestureDrawUI.classList.add('active');
    } else if (gestureMsg === 'MOVE') {
        gestureMoveUI.classList.add('active');
    } else if (gestureMsg === 'CLEAR') {
        gestureClearUI.classList.add('active');
    }
}

// ====== MediaPipe Hands Results Handler ======
function onResults(results) {
    // Hide the loading overlay when the first valid frames arrive
    if (loadingOverlay.classList.contains('active')) {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.classList.remove('active');
            loadingOverlay.style.display = 'none';
        }, 500);
    }

    if (results.image && canvasElement.width !== results.image.width) {
        canvasElement.width = results.image.width || 1280;
        canvasElement.height = results.image.height || 720;
    }

    const width = canvasElement.width;
    const height = canvasElement.height;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, width, height);
    
    if (results.image) {
        canvasCtx.drawImage(results.image, 0, 0, width, height);
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: 'rgba(255, 255, 255, 0.4)', lineWidth: 2});
        drawLandmarks(canvasCtx, landmarks, {color: 'rgba(51, 204, 255, 0.8)', lineWidth: 2, radius: 4});

        // ====== Reliable Finger Counting Logic ======
        let fingers = 0;
        
        // A finger is UP if tip.y < pip.y
        if (landmarks[8].y < landmarks[6].y) fingers++;   // Index
        if (landmarks[12].y < landmarks[10].y) fingers++; // Middle
        if (landmarks[16].y < landmarks[14].y) fingers++; // Ring
        if (landmarks[20].y < landmarks[18].y) fingers++; // Pinky

        // Log number of counted fingers
        console.log("Fingers:", fingers);

        // Core Drawing Reference coordinates (Index tip is our main pointer)
        const indexTip = landmarks[8];
        const x = indexTip.x * width;
        const y = indexTip.y * height;

        // ====== Mode Control via Finger Count ======
        let gesture = "NONE";

        if (fingers >= 4) {
             // 4 or 5 fingers -> Clear canvas
            gesture = "CLEAR";
            drawing = false;
        } 
        else if (fingers >= 2) {
             // 2 or 3 fingers -> Move mode (NO drawing)
             gesture = "MOVE";
             drawing = false;
        } 
        else if (fingers === 1) {
             // 1 finger -> Drawing mode
             gesture = "DRAW";
             drawing = true;
        }
        else {
             // 0 fingers -> Idle / Pause
             drawing = false;
        }

        setActiveGestureUI(gesture);

        // Clear action execution
        if (gesture === 'CLEAR') {
            allPaths = [];
            currentPath = [];
            
            // Visual indicator for Clear mode
            const palmCenter = landmarks[9];
            canvasCtx.beginPath();
            canvasCtx.arc(palmCenter.x * width, palmCenter.y * height, 25, 0, 2 * Math.PI);
            canvasCtx.fillStyle = 'rgba(239, 68, 68, 0.6)';
            canvasCtx.fill();
        }

        // ====== Drawing Control ======
        if (drawing) {
             // Only draw when drawing === true
             if (currentPath.length === 0) {
                 // Start of a new line segment
                 currentPath = [{ x: x, y: y }];
                 allPaths.push({ color: currentColor, points: currentPath });
             } else {
                 // Continuing the line
                 currentPath.push({ x: x, y: y });
             }
        } else {
             // Not drawing anything, break current path cleanly
             currentPath = [];
        }

        // ====== Add Visible Cursor ======
        // Always draw a small circle at (x, y) so user can see movement reliably!
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, drawing ? 10 : 8, 0, 2 * Math.PI);
        canvasCtx.fillStyle = drawing ? currentColor : 'rgba(255, 255, 255, 0.5)';
        canvasCtx.fill();
        canvasCtx.strokeStyle = 'white';
        canvasCtx.lineWidth = drawing ? 2 : 1;
        canvasCtx.stroke();

        // ====== Always update coordinates ======
        prevX = x;
        prevY = y;
        
    } else {
        // No hands detected
        drawing = false;
        currentPath = [];
        setActiveGestureUI("NONE");
    }

    // ====== Render All Stored Drawn Paths ======
    allPaths.forEach(pathObj => {
        const points = pathObj.points;
        if (points.length < 1) return;

        canvasCtx.beginPath();
        canvasCtx.moveTo(points[0].x, points[0].y);
        
        for (let i = 1; i < points.length; i++) {
            const xc = (points[i].x + points[i-1].x) / 2;
            const yc = (points[i].y + points[i-1].y) / 2;
            canvasCtx.quadraticCurveTo(points[i-1].x, points[i-1].y, xc, yc);
        }
        
        if (points.length > 1) {
            const last = points[points.length - 1];
            canvasCtx.lineTo(last.x, last.y);
        }

        canvasCtx.strokeStyle = pathObj.color;
        canvasCtx.lineWidth = strokeWidth;
        canvasCtx.lineCap = 'round';
        canvasCtx.lineJoin = 'round';
        canvasCtx.stroke();
    });

    canvasCtx.restore();
}

// ====== Setup MediaPipe ======
const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

hands.onResults(onResults);

// ====== Application Initialization Handle ======
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 1280,
    height: 720
});

// App lifecycle triggers when user clicks Start on Welcome Modal
startBtn.addEventListener('click', () => {
    // Hide the modal with CSS transition
    welcomeModal.classList.add('hidden');
    
    // Switch the loading overlay back to active so it indicates backend load
    loadingOverlay.classList.add('active');
    loadingOverlay.style.display = 'flex';

    // Boot hardware interactions
    camera.start().catch(err => {
        alert("Please allow camera permissions to use Air Draw.");
        console.error("Camera access denied or failed:", err);
        // Turn off overlay if it fails
        loadingOverlay.classList.remove('active');
        loadingOverlay.style.display = 'none';
        welcomeModal.classList.remove('hidden'); // allow them to retry
    });
});
