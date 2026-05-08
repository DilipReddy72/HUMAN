const video = document.querySelector("#camera");
const canvas = document.querySelector("#frame");
const statusText = document.querySelector("#status");
const resultText = document.querySelector("#resultText");
const startButton = document.querySelector("#start");
const scanButton = document.querySelector("#scan");
const listenButton = document.querySelector("#listen");
const repeatButton = document.querySelector("#repeat");
const locateButton = document.querySelector("#locate");
const setDestinationButton = document.querySelector("#setDestination");
const autoScan = document.querySelector("#autoScan");
const questionInput = document.querySelector("#question");
const destinationInput = document.querySelector("#destination");
const locationText = document.querySelector("#locationText");
const routeText = document.querySelector("#routeText");
const modeButtons = [...document.querySelectorAll(".mode")];

let currentMode = "navigate";
let lastSpoken = "";
let isScanning = false;
let autoTimer = null;
let locationWatch = null;
let stream = null;
let currentPosition = null;
let destination = null;
let routeSummary = null;

const directions = [
  "north",
  "north east",
  "east",
  "south east",
  "south",
  "south west",
  "west",
  "north west",
];

function setStatus(message) {
  statusText.textContent = message;
}

function speak(message) {
  lastSpoken = message;
  resultText.textContent = message;
  repeatButton.disabled = false;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 1.02;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function vibrate(pattern) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function formatDistance(meters) {
  if (meters < 30) return "very close";
  if (meters < 160) return `${Math.round(meters / 10) * 10} meters`;
  if (meters < 1609) return `${Math.round(meters)} meters`;
  return `${(meters / 1609.344).toFixed(1)} miles`;
}

function bearingName(degrees) {
  const index = Math.round(degrees / 45) % directions.length;
  return directions[index];
}

function distanceMeters(from, to) {
  const earthRadius = 6_371_000;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(from, to) {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function parseCoordinates(value) {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { lat, lng };
}

function updateRouteSummary(announce = false) {
  if (!currentPosition) {
    locationText.textContent = "Waiting for GPS.";
    return;
  }

  const accuracy = Math.round(currentPosition.accuracy);
  locationText.textContent = `GPS active. Accuracy about ${accuracy} meters.`;

  if (!destination) {
    routeSummary = null;
    routeText.textContent = "No destination set.";
    return;
  }

  const meters = distanceMeters(currentPosition, destination);
  const bearing = bearingDegrees(currentPosition, destination);
  const distanceText = formatDistance(meters);
  const bearingText = bearingName(bearing);
  routeSummary = {
    distanceText,
    bearingText,
    summary: `The user is moving toward a destination ${distanceText} away, generally ${bearingText}.`,
  };
  routeText.textContent = `Destination is ${distanceText} ${bearingText}.`;

  if (announce) {
    speak(`Destination set. It is ${distanceText} ${bearingText}.`);
  }
}

function startGps() {
  if (!("geolocation" in navigator)) {
    speak("GPS is not supported in this browser.");
    return;
  }

  if (locationWatch !== null) {
    speak("GPS is already tracking.");
    return;
  }

  locationText.textContent = "Requesting GPS permission.";
  locationWatch = navigator.geolocation.watchPosition(
    (position) => {
      currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      locateButton.textContent = "GPS On";
      updateRouteSummary();
    },
    () => {
      locationWatch = null;
      locationText.textContent = "GPS permission is needed.";
      speak("GPS permission is needed for route guidance.");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2500,
      timeout: 12000,
    },
  );
  speak("GPS tracking started.");
}

function setDestination() {
  const coordinates = parseCoordinates(destinationInput.value);
  if (!coordinates) {
    speak("Enter destination as latitude comma longitude. For example, 37.7749 comma minus 122.4194.");
    return;
  }

  destination = coordinates;
  updateRouteSummary(true);
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = stream;
    scanButton.disabled = false;
    startButton.textContent = "Camera On";
    setStatus("Camera ready");
    speak("Camera is ready. Tap describe now, or turn on auto describe.");
  } catch (error) {
    const message = "Camera permission is needed. On a phone, this must run on HTTPS or localhost.";
    setStatus(message);
    speak(message);
  }
}

function captureFrame() {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  const maxWidth = 900;
  const scale = Math.min(1, maxWidth / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

async function describeNow() {
  if (!stream || isScanning) return;

  isScanning = true;
  scanButton.disabled = true;
  setStatus("Looking...");
  vibrate(40);

  try {
    const response = await fetch("/api/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image: captureFrame(),
        mode: currentMode,
        question: questionInput.value.trim(),
        navigation: routeSummary,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "AI description failed.");
    }

    setStatus("Spoken");
    speak(data.text);
  } catch (error) {
    setStatus("Needs attention");
    speak(error.message || "Something went wrong.");
  } finally {
    isScanning = false;
    scanButton.disabled = false;
  }
}

function setMode(mode) {
  currentMode = mode;
  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  speak(`${mode} mode`);
}

function updateAutoScan() {
  clearInterval(autoTimer);
  autoTimer = null;
  if (autoScan.checked) {
    speak("Auto describe is on.");
    describeNow();
    autoTimer = setInterval(describeNow, 8000);
  } else {
    speak("Auto describe is off.");
  }
}

function startVoiceAsk() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    speak("Voice ask is not supported in this browser. Type the target in find mode instead.");
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  setStatus("Listening...");
  vibrate([35, 40, 35]);

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    questionInput.value = transcript;
    setMode("find");
    speak(`Looking for ${transcript}`);
    describeNow();
  };

  recognition.onerror = () => {
    speak("I could not hear that. Please try again.");
  };

  recognition.start();
}

startButton.addEventListener("click", startCamera);
locateButton.addEventListener("click", startGps);
setDestinationButton.addEventListener("click", setDestination);
scanButton.addEventListener("click", describeNow);
listenButton.addEventListener("click", startVoiceAsk);
repeatButton.addEventListener("click", () => speak(lastSpoken));
autoScan.addEventListener("change", updateAutoScan);
modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

window.addEventListener("beforeunload", () => {
  stream?.getTracks().forEach((track) => track.stop());
  if (locationWatch !== null) {
    navigator.geolocation.clearWatch(locationWatch);
  }
});
