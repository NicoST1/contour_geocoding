class ContourExtraction {
    constructor(name) {
        this.name = name;
        this.canvas = $('#contour-canvas')[0];
        this.canvasCtx = this.canvas.getContext('2d');
        this.imgBlob = null;
        this.isDrawing = false;
        this.isErasing = false;
        this.startX = null;
        this.startY = null;
        this.erasedRectangles = [];
        this.contourImage = null;
        this.selectedColorsIdx = [];
        this.init();
    }

    /**
     * Initializes the class by setting up event listeners for image upload, 
     * preprocessing controls, colour selection, and canvas interactions.
     */
    init() {
        // Event listener to set uploaded image and resize canvas
        $('#selected-image').on('load', this.handleImageLoad.bind(this));
        
        // Preprocessing controls
        $('#contrast-slider, #brightness-slider, #cluster-slider').on('input', this.preprocessImage.bind(this));

        // Colour selection for contour extraction
        $('#colours-container').on('click', '.colour-box', this.extractContours.bind(this));

        // Postprocessing controls
        $('#dilate-slider, #erode-slider, #area-slider').on('input', this.extractContours.bind(this));

        // Mouse event listeners for erasing parts of the contours
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseout', this.handleMouseOut.bind(this));

        // Eraser button
        $('#eraser-btn').on('click', this.toggleEraser.bind(this));

        // Undo button
        $('#undo-btn').on('click', this.undoErasing.bind(this));
    }

    /**
     * Handles the event when an image is loaded. Sets the image on the canvas and processes it.
     */
    handleImageLoad() {
        const imageContour = $('#image-contour');
        const imgSrc = $('#selected-image').attr('src');
        imageContour.attr('src', imgSrc).show();
        imageContour.one('load', () => {
            this.canvas.width = imageContour[0].naturalWidth;
            this.canvas.height = imageContour[0].naturalHeight;
        });

        $.ajax({
            url: imgSrc,
            type: 'GET',
            xhrFields: {
                responseType: 'blob'
            },
            success: (blob) => {
                if (!blob) {
                    throw new Error('Network response was not ok');
                }
                this.imgBlob = blob;
                this.preprocessImage();
            },
            error: (jqXHR, textStatus, errorThrown) => {
                console.error('Error fetching the image:', textStatus, errorThrown);
            }
        });
    }

    /**
     * Clears the canvas by removing all drawings.
     */
    clearCanvas() {
        this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.contourImage = null;
    }

    /**
     * Loads an image to the canvas and saves the current state of the canvas image.
     * @param {string} imageSource - The source URL of the image.
     */
    loadImageToCanvas(imageSource) {
        const img = new Image();
        img.src = imageSource;

        img.onload = () => {
            this.clearCanvas();
            this.canvasCtx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            this.setCanvasImage();
        };
    }

    /**
     * Saves the current state of the canvas image for future restoration.
     */
    setCanvasImage() {
        this.contourImage = this.canvasCtx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Gets the mouse position relative to the canvas.
     * @param {MouseEvent} e - The mouse event.
     * @returns {Object} The x and y coordinates of the mouse position.
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
     * Draws a rectangle on the canvas to indicate the area to be erased.
     * @param {MouseEvent} e - The mouse event.
     */
    drawRectangle(e) {
        const pos = this.getMousePos(e);
        const rectWidth = pos.x - this.startX;
        const rectHeight = pos.y - this.startY;

        // Restore the saved image data
        this.canvasCtx.putImageData(this.contourImage, 0, 0);
        // Draw the rectangle
        this.canvasCtx.strokeStyle = 'red';
        this.canvasCtx.lineWidth = 2;
        this.canvasCtx.strokeRect(this.startX, this.startY, rectWidth, rectHeight);
    }

    /**
     * Erases the drawn rectangle area on the canvas.
     * @param {MouseEvent} e - The mouse event.
     */
    eraseRectangle(e) {
        const pos = this.getMousePos(e);
        const endX = Math.round(Math.min(Math.max(this.startX, pos.x), this.canvas.width));
        const startXAdjusted = Math.round(Math.max(Math.min(this.startX, pos.x), 0));
        const endY = Math.round(Math.min(Math.max(this.startY, pos.y), this.canvas.height));
        const startYAdjusted = Math.round(Math.max(Math.min(this.startY, pos.y), 0));

        const width = endX - startXAdjusted;
        const height = endY - startYAdjusted;

        // Add the erased rectangle to the array
        this.erasedRectangles.push({ x: startXAdjusted, y: startYAdjusted, width, height });
        // Restore the saved image data
        this.canvasCtx.putImageData(this.contourImage, 0, 0);
        // Set the pixels in the rectangle to black
        this.canvasCtx.fillStyle = 'black';
        this.canvasCtx.fillRect(startXAdjusted, startYAdjusted, width, height);

        this.setCanvasImage();
    }

    /**
     * Displays the selected colours in the colours container.
     * @param {Array} colours - The array of colours to display.
     */
    displayColours(colours) {
        const colorsContainer = $('#colours-container');
        colorsContainer.empty();
        colours.forEach((colour) => {
            const colourBox = $('<div class="colour-box"></div>');
            colourBox.css('background-color', `rgb(${colour[2]}, ${colour[1]}, ${colour[0]})`);
            colourBox.data('color', colour);
            colorsContainer.append(colourBox);
        });

        $('.colour-box').on('click', function () {
            $(this).toggleClass('selected');
        });
    }

    /**
     * Preprocesses the image by applying contrast, brightness, and clustering adjustments,
     * then sends the image data to the server for further processing.
     */
    preprocessImage() {
        if (!this.imgBlob) {
            console.error('Image blob is not available');
            return;
        }

        const formData = new FormData();
        formData.append('image', this.imgBlob);
        formData.append('contrast_alpha', parseFloat($('#contrast-slider').val()));
        formData.append('contrast_beta', parseFloat($('#brightness-slider').val()));
        formData.append('n_clusters', parseFloat($('#cluster-slider').val()));

        $.ajax({
            type: 'POST',
            url: '/get_colours',
            data: formData,
            processData: false,
            contentType: false,
            success: (response) => {
                this.displayColours(response.colours);
                $('#image-contour').attr('src', 'data:image/jpeg;base64,' + response.image);
                this.clearCanvas();
            },
            error: (error) => {
                console.error('Error:', error);
            }
        });
    }

    /**
     * Extracts contours from the image based on the selected colours,
     * then sends the image data and contour settings to the server for processing.
     */
    extractContours() {
        if (!this.imgBlob) {
            console.error('Image blob is not available');
            return;
        }

        const selectedColors = [];
        const centroidColours = [];
        $('.colour-box').each(function () {
            if ($(this).hasClass('selected')) {
                selectedColors.push($(this).data('color'));
            }
            centroidColours.push($(this).data('color'));
        });

        if (selectedColors.length === 0) {
            this.clearCanvas();
            return;
        }

        const formData = new FormData();
        formData.append('image', this.imgBlob);
        formData.append('selected_colours', JSON.stringify(selectedColors));
        formData.append('centroid_colours', JSON.stringify(centroidColours));
        formData.append('contrast_alpha', parseFloat($('#contrast-slider').val()));
        formData.append('contrast_beta', parseFloat($('#brightness-slider').val()));
        formData.append('n_clusters', parseFloat($('#cluster-slider').val()));
        formData.append('dilate_iterations', parseFloat($('#dilate-slider').val()));
        formData.append('erode_iterations', parseFloat($('#erode-slider').val()));
        formData.append('min_contour_area', parseFloat($('#area-slider').val()));
        formData.append('erased_rectangles', JSON.stringify(this.erasedRectangles));

        $.ajax({
            type: 'POST',
            url: '/get_contour_image',
            data: formData,
            processData: false,
            contentType: false,
            success: (response) => {
                this.loadImageToCanvas('data:image/jpeg;base64,' + response.image);
            },
            error: (error) => {
                console.error('Error:', error);
            }
        });
    }

    

    /**
     * Handles the mousedown event on the canvas to initiate drawing.
     * @param {MouseEvent} e - The mouse event.
     */
    handleMouseDown(e) {
        if (!this.contourImage) return;
        if (this.canvasClear) {
            alert('No Contours Extracted. Please select colors to extract contours.');
            return;
        }

        this.isDrawing = true;
        const pos = this.getMousePos(e);
        this.startX = pos.x;
        this.startY = pos.y;
        this.setCanvasImage();
    }

    /**
     * Handles the mousemove event on the canvas to draw the rectangle.
     * @param {MouseEvent} e - The mouse event.
     */
    handleMouseMove(e) {
        if (this.isDrawing && this.contourImage) {
            this.drawRectangle(e);
        }
    }

    /**
     * Handles the mouseup event on the canvas to complete drawing and erase the rectangle.
     * @param {MouseEvent} e - The mouse event.
     */
    handleMouseUp(e) {
        if (this.isDrawing) {
            this.eraseRectangle(e);
            this.isDrawing = false;
        }
    }

    /**
     * Handles the mouseout event on the canvas to complete drawing and erase the rectangle.
     * @param {MouseEvent} e - The mouse event.
     */
    handleMouseOut(e) {
        if (this.isDrawing) {
            this.eraseRectangle(e);
            this.isDrawing = false;
        }
    }

    /**
     * Toggles the eraser mode on and off.
     */
    toggleEraser() {
        if (!this.contourImage) {
            alert('No Contours Extracted. Please select colors to extract contours.');
            return;
        }

        if (this.isErasing) {
            this.isErasing = false;
            this.isDrawing = false;
            this.canvas.classList.remove('cross-cursor');
            $('#eraser-btn').removeClass('pressed');
        } else {
            this.isErasing = true;
            this.canvas.classList.add('cross-cursor');
            $('#eraser-btn').addClass('pressed');
        }
    }

    /**
     * Resets the erasing action and restores the original contours.
     */
    undoErasing() {
        if (!this.contourImage) return;
        this.erasedRectangles.length = 0;
        this.extractContours();
    }

    /**
     * Converts the canvas content to a Blob object.
     * @returns {Promise<Blob>} A promise that resolves with the Blob of the canvas image.
     */
    canvasToBlob() {
        return new Promise((resolve) => {
            this.canvas.toBlob(resolve);
        });
    }

    /**
     * Extracts contours from the canvas and sends them to the server for processing.
     * @returns {Promise<Array>} A promise that resolves with the contours data from the server.
     */
    async getContours() {
        const contourBlob = await this.canvasToBlob();
    
        const formData = new FormData();
        formData.append('image', contourBlob);
    
        return new Promise((resolve, reject) => {
            $.ajax({
                type: 'POST',
                url: '/get_contours',
                data: formData,
                processData: false,
                contentType: false,
                success: (response) => {
                    resolve(response.contours);
                },
                error: (error) => {
                    reject(new Error('Error extracting contours: ' + error));
                }
            });
        });
    }
}
