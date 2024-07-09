class ContourGeocoding {
    constructor() {
        this.map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
        this.canvas = $('#canvas-overlay')[0];
        this.canvasCtx = this.canvas.getContext('2d');
        this.startPoint = null;
        this.lines = [];
        this.contours = null;
        this.geoContours = [];
        this.init();
    }

    /**
     * Initializes the map, event listeners, and UI controls.
     */
    init() {
        // Initialize the map with OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        // Add custom control buttons to the map
        this.addControlButtons();

        // Initialize the search control
        const provider = new window.GeoSearch.OpenStreetMapProvider();
        const search = new GeoSearch.GeoSearchControl({
            provider: provider,
            style: 'simple',
            updateMap: true,
            autoClose: true,
            position: 'topleft'
        });
        this.map.addControl(search);

        // Event listeners for image loading and canvas interactions
        $('#selected-image').on('load', this.handleImageLoad.bind(this));
        $('#image-geo').on('click', this.handleImageClick.bind(this));
        $('#canvas-overlay').on('click', this.handleCanvasClick.bind(this));
        $('#canvas-overlay').on('mousemove', this.handleCanvasMouseMove.bind(this));
    }

    /**
     * Adds custom control buttons (Download and Clear) to the map.
     */
    addControlButtons() {
        // Download button
        const downloadButton = L.control({ position: 'topright' });
        downloadButton.onAdd = () => {
            const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
            div.innerHTML = 'Download';
            div.style.backgroundColor = 'white';
            div.style.padding = '5px';
            div.style.cursor = 'pointer';
            L.DomEvent.disableClickPropagation(div);
            div.onclick = this.downloadContours.bind(this);
            return div;
        };
        downloadButton.addTo(this.map);

        // Clear button
        const clearButton = L.control({ position: 'topright' });
        clearButton.onAdd = () => {
            const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
            div.innerHTML = 'Clear';
            div.style.backgroundColor = 'white';
            div.style.padding = '5px';
            div.style.cursor = 'pointer';
            div.onclick = this.clearAll.bind(this);
            return div;
        };
        clearButton.addTo(this.map);
    }

    /**
     * Handles image loading and sets the image source for geocoding.
     */
    handleImageLoad() {
        const imageGeocode = $('#image-geo');
        const imgSrc = $('#selected-image').attr('src');
        imageGeocode.attr('src', imgSrc).show();
    }

    /**
     * Handles image click event to set the starting point for line drawing.
     * @param {Event} e - The click event.
     */
    handleImageClick(e) {
        const pos = this.getMousePos(e);
        this.startPoint = pos;
        this.canvas.style.pointerEvents = 'auto';
    }

    /**
     * Handles canvas click event to draw lines and trigger geocoding if necessary.
     * @param {Event} e - The click event.
     */
    handleCanvasClick(e) {
        const pos = this.getMousePos(e);
        const elementClicked = this.getElementAtPoint(pos);

        if (this.startPoint && elementClicked === 'map') {
            const endPoint = pos;
            this.drawLine(this.startPoint, endPoint, false);
            this.lines.push([this.startPoint, endPoint]);
            if (this.lines.length === 3) {
                this.geocodeContour();
                this.clearLines();
            }
        } else {
            this.clearCurrentLine();
        }

        this.startPoint = null;
        this.canvas.style.pointerEvents = 'none';
    }

    /**
     * Handles mouse move event to draw the current line temporarily.
     * @param {Event} e - The mouse move event.
     */
    handleCanvasMouseMove(e) {
        if (!this.startPoint) return;
        const currentPosition = this.getMousePos(e);
        this.drawCurrentLine(this.startPoint, currentPosition, true);
    }

    /**
     * Resizes containers and adjusts map and canvas dimensions.
     */
    resizeContainers() {
        const columnWidth = $('#image-geo-col').width();

        $('#image-geo-container').css({
            width: `${columnWidth}px`,
            height: `${columnWidth}px`
        });

        $('#map-container').css({
            width: `${columnWidth}px`,
            height: `${columnWidth}px`
        });

        $('#map').css({
            width: `${columnWidth}px`,
            height: `${columnWidth}px`
        });

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.map.invalidateSize();
        this.transformContours();
    }

    /**
     * Gets the mouse position relative to the canvas.
     * @param {Event} e - The mouse event.
     * @returns {Object} The mouse position {x, y}.
     */
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    /**
     * Determines which element (image or map) was clicked based on coordinates.
     * @param {Object} point - The point coordinates {x, y}.
     * @returns {string|null} The element name ('image' or 'map') or null if none.
     */
    getElementAtPoint(point) {
        const imageRect = $('#image-geo')[0].getBoundingClientRect();
        const mapRect = $('#map')[0].getBoundingClientRect();

        if (point.x >= imageRect.left && point.x <= imageRect.right && point.y >= imageRect.top && point.y <= imageRect.bottom) {
            return 'image';
        } else if (point.x >= mapRect.left && point.x <= mapRect.right && point.y >= mapRect.top && point.y <= mapRect.bottom) {
            return 'map';
        }
        return null;
    }

    /**
     * Clears the current temporary line.
     */
    clearCurrentLine() {
        this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.lines.forEach(([start, end]) => {
            this.drawLine(start, end, false);
        });
    }

    /**
     * Clears all lines from the canvas.
     */
    clearLines() {
        this.lines = [];
        this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Clears all lines and contours from the map and canvas.
     */
    clearAll() {
        this.clearLines();
        this.clearMapContours();
        this.geoContours.length = 0;
    }

    /**
     * Draws a temporary line and then redraws the permanent lines.
     * @param {Object} start - The starting point {x, y}.
     * @param {Object} end - The ending point {x, y}.
     */
    drawCurrentLine(start, end) {
        this.clearCurrentLine();
        this.drawLine(start, end, true);
    }

    /**
     * Draws a line on the canvas.
     * @param {Object} start - The starting point {x, y}.
     * @param {Object} end - The ending point {x, y}.
     * @param {boolean} isTemporary - Whether the line is temporary.
     */
    drawLine(start, end, isTemporary) {
        this.canvasCtx.setLineDash(isTemporary ? [5, 5] : []);
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(start.x, start.y);
        this.canvasCtx.lineTo(end.x, end.y);
        this.canvasCtx.strokeStyle = 'red';
        this.canvasCtx.lineWidth = 1;
        this.canvasCtx.stroke();
    }

    /**
     * Transforms points from the canvas coordinate system to map latitude/longitude.
     * @param {Array} points - The points to transform.
     * @returns {Array} The transformed points as [latitude, longitude].
     */
    transformPointsToLatLng(points) {
        const canvasRect = this.canvas.getBoundingClientRect();
        const mapContainerRect = this.map.getContainer().getBoundingClientRect();
        return points.map(point => {
            const canvasX = (point[0] * (canvasRect.width / this.canvas.width)) + canvasRect.left;
            const canvasY = (point[1] * (canvasRect.height / this.canvas.height)) + canvasRect.top;
            const containerX = canvasX - mapContainerRect.left;
            const containerY = canvasY - mapContainerRect.top;
            const latLng = this.map.containerPointToLatLng([containerX, containerY]);
            return [latLng.lat, latLng.lng];
        });
    }
    
    /**
     * Clears all contours from the map.
     */
    clearMapContours() {
        if (this.map.contourLayers) {
            this.map.contourLayers.forEach(layer => this.map.removeLayer(layer));
        }
        this.map.contourLayers = [];
    }

    /**
     * Draws contours on the map.
     * @param {Array} contours - The contours to draw.
     */
    drawContoursOnMap(contours) {
        this.clearMapContours();
        this.map.contourLayers = [];

        contours.forEach(contour => {
            const contourLayer = L.polygon(contour, {
                color: 'blue',
                weight: 2,
                fillColor: 'blue',
                fillOpacity: 0.1
            }).addTo(this.map);
            this.map.contourLayers.push(contourLayer);
        });
    }

    /**
     * Geocodes the contours by transforming their coordinates to latitude/longitude.
     */
    geocodeContour() {
        const formData = new FormData();
        formData.append('point_pairs', JSON.stringify(this.lines));
        formData.append('contours', JSON.stringify(this.contours));

        $.ajax({
            url: '/transform_contours',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: (response) => {
                this.geoContours = [];
                response.trans_contours.forEach((contour) => {
                    const geoContour = this.transformPointsToLatLng(contour);
                    this.geoContours.push(geoContour);
                });
                this.drawContoursOnMap(this.geoContours);
            },
            error: (error) => {
                console.error('Error geocoding contour:', error);
            }
        });
    }

    /**
     * Downloads the geocoded contours as a GeoJSON file.
     */
    downloadContours() {
        if (this.geoContours.length === 0) {
            alert('Please select 3 point correspondences to extract geocoded contour.');
            return;
        }

        const features = this.geoContours.map(contour => {
            const coordinates = contour.map(point => [point[1], point[0]]);
            return {
                type: "Feature",
                geometry: {
                    type: "Polygon",
                    coordinates: [coordinates]
                },
                properties: {}
            };
        });

        const geoJson = { type: "FeatureCollection", features: features };
        const dataStr = JSON.stringify(geoJson);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = "geocoded_contours.geojson";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }
    
    /**
     * Transforms the contours to fit the displayed image size and position.
     */
    transformContours() {
        if (!this.contours) return;
        const contourCanvas = $('#contour-canvas')[0];
        const displayedImageInfo = this.getDisplayedImageSizeAndPosition();
        const scaleX = displayedImageInfo.width / contourCanvas.width;
        const scaleY = displayedImageInfo.height / contourCanvas.height;
        this.contours = this.contours.map(contour => {
            return contour.map(point => {
                return [point[0] * scaleX + displayedImageInfo.left, point[1] * scaleY + displayedImageInfo.top];
            });
        });
    }

    /**
     * Sets the contours and transforms them to fit the displayed image size.
     * @param {Array} contours - The contours to set.
     */
    setContours(contours) {
        this.contours = contours;
        this.transformContours();
    }

    /**
     * Gets the displayed size and position of the image for geocoding.
     * @returns {Object} The displayed size and position {width, height, left, top}.
     */
    getDisplayedImageSizeAndPosition() {
        const container = document.getElementById('image-geo-container');
        const image = document.getElementById('image-geo');

        // Intrinsic dimensions of the image
        const intrinsicWidth = image.naturalWidth;
        const intrinsicHeight = image.naturalHeight;

        // Dimensions of the container
        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;

        // Aspect ratios
        const imageAspectRatio = intrinsicWidth / intrinsicHeight;
        const containerAspectRatio = containerWidth / containerHeight;

        let displayedWidth, displayedHeight, offsetX, offsetY;

        if (imageAspectRatio > containerAspectRatio) {
            // Image is wider than container
            displayedWidth = containerWidth;
            displayedHeight = containerWidth / imageAspectRatio;
            offsetX = 0;
            offsetY = (containerHeight - displayedHeight) / 2;
        } else {
            // Image is taller than container
            displayedWidth = containerHeight * imageAspectRatio;
            displayedHeight = containerHeight;
            offsetX = (containerWidth - displayedWidth) / 2;
            offsetY = 0;
        }

        return {
            width: displayedWidth,
            height: displayedHeight,
            left: containerRect.left + offsetX,
            top: containerRect.top + offsetY
        };
    }
}