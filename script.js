let map;
        let routingControl;
        let speechQueue = [];
        let currentChunkIndex = 0;
        let isPaused = true;
        let currentUtterance = null;

        function initializeMap() {
            if (!map) {
                map = L.map('map', {
                    center: [20.5937, 78.9629],
                    zoom: 5,
                    zoomControl: true
                });

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19
                }).addTo(map);

                routingControl = L.Routing.control({
                    waypoints: [],
                    routeWhileDragging: true,
                    serviceUrl: 'https://router.project-osrm.org/route/v1',
                    profile: 'driving',
                    createMarker: function() {
                        return null;
                    }
                }).addTo(map);

                window.map = map;
                window.routingControl = routingControl;
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            initializeMap();
        });

        function updateRoute() {
            var source = document.getElementById('source').value.trim();
            var destination = document.getElementById('destination').value.trim();

            if (!source || !destination) {
                alert("Please enter both source and destination.");
                return;
            }

            Promise.all([
                    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(source)}`),
                    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`)
                ])
                .then(responses => Promise.all(responses.map(response => response.json())))
                .then(([sourceData, destData]) => {
                    if (sourceData.length === 0) throw new Error("Invalid source location");
                    if (destData.length === 0) throw new Error("Invalid destination location");

                    const coords = {
                        source: [parseFloat(sourceData[0].lat), parseFloat(sourceData[0].lon)],
                        destination: [parseFloat(destData[0].lat), parseFloat(destData[0].lon)]
                    };

                    map.setView(coords.source, 10);
                    routingControl.setWaypoints([
                        L.latLng(coords.source),
                        L.latLng(coords.destination)
                    ]);

                    routingControl.on('routesfound', function(e) {
                        const routes = e.routes;
                        if (routes && routes.length > 0) {
                            const instructions = routes[0].instructions;
                            speakDirections(instructions);
                        }
                    });

                    simulateTrafficAlerts();
                    simulateParkingSpots();
                    getNearbyFuelStations(coords.destination);
                })
                .catch(error => {
                    alert(error.message || "Error setting up route. Please try different locations.");
                });
        }

        function speakDirections(instructions) {
            // Reset speech synthesis and state
            window.speechSynthesis.cancel();
            speechQueue = [];
            currentChunkIndex = 0;
            isPaused = true;

            // Show speech controls
            document.querySelector('.speech-controls').style.display = 'block';

            // Prepare speech text
            const intro = `Starting navigation from ${document.getElementById('source').value} to ${document.getElementById('destination').value}.`;

            const directionsText = instructions.map(instruction => {
                let text = instruction.text.replace(/<[^>]*>/g, '');
                if (instruction.distance) {
                    const distance = instruction.distance > 1000 ?
                        `${(instruction.distance/1000).toFixed(1)} kilometers` :
                        `${instruction.distance.toFixed(0)} meters`;
                    text += ` for ${distance}`;
                }
                return text;
            }).join('. ');

            const fullText = `${intro} ${directionsText}`;
            speechQueue = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
        }

        function toggleSpeech() {
            const button = document.getElementById('playPauseButton');

            if (isPaused) {
                // Start or resume speech
                isPaused = false;
                button.innerHTML = '⏸️ Pause Navigation Voice';
                button.title = 'Pause voice navigation';
                if (currentChunkIndex < speechQueue.length) {
                    speakNextChunk();
                } else {
                    // If we reached the end, start over
                    currentChunkIndex = 0;
                    speakNextChunk();
                }
            } else {
                // Pause speech
                isPaused = true;
                button.innerHTML = '▶️ Start Navigation Voice';
                button.title = 'Resume voice navigation';
                window.speechSynthesis.cancel();
            }
        }

        function speakNextChunk() {
            if (isPaused || currentChunkIndex >= speechQueue.length) {
                if (currentChunkIndex >= speechQueue.length) {
                    // Reset to beginning when finished
                    currentChunkIndex = 0;
                    isPaused = true;
                    document.getElementById('playPauseButton').innerHTML = '▶️ Play';
                }
                return;
            }

            currentUtterance = new SpeechSynthesisUtterance(speechQueue[currentChunkIndex]);

            currentUtterance.onend = () => {
                currentChunkIndex++;
                speakNextChunk();
            };

            window.speechSynthesis.speak(currentUtterance);
        }

        function getNearbyFuelStations(coords) {
            let fuelBox = document.getElementById("fuel");
            fuelBox.innerHTML = "Fetching nearby fuel stations...";

            fetch(`https://overpass-api.de/api/interpreter?data=[out:json];node[amenity=fuel](around:5000,${coords[0]},${coords[1]});out;`)
                .then(response => response.json())
                .then(data => {
                    if (data.elements.length > 0) {
                        fuelBox.innerHTML = data.elements.map(e => {
                            let distance = getDistance(coords[0], coords[1], e.lat, e.lon).toFixed(2);
                            return `⛽ ${e.tags.name || "Fuel Station"} - ${distance} km`;
                        }).join("<br>");
                    } else {
                        fuelBox.innerHTML = "No nearby fuel stations found.";
                    }
                })
                .catch(() => {
                    fuelBox.innerHTML = "Unable to fetch fuel station data.";
                });
        }

        function simulateParkingSpots() {
            let parkingBox = document.getElementById("parking");
            let spots = [
                "🅿 Multi-level Parking (30 slots available)",
                "🅿 Street-side Parking (15 slots available)",
                "🅿 Mall Parking (50 slots available)",
                "🅿 Underground Parking (10 slots available)"
            ];
            parkingBox.innerHTML = spots[Math.floor(Math.random() * spots.length)];
        }

        function simulateTrafficAlerts() {
            let alerts = [
                "🚗 Heavy congestion near Central Avenue!",
                "🚦 Signal failure at Main Street!",
                "🚧 Road construction at Park Avenue, expect delays!",
                "🛑 Accident reported on Highway 45, avoid the area."
            ];
            let alertBox = document.getElementById('traffic-alerts');
            alertBox.innerHTML = alerts[Math.floor(Math.random() * alerts.length)];
        }

        function getDistance(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        function toggleTheme() {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        }