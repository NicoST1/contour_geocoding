$(document).ready(function() {
    const imageUpload = new ImageUpload('Image Uploader');
    const contourExtraction = new ContourExtraction('Contour Extraction');
    const contourGeocoding = new ContourGeocoding('Contour Geocoding');

    /**
     * Event handler for step navigation clicks.
     * Validates necessary steps and manages active states.
     */
    $('.step').click(async function() {
        var step = $(this).data('step');

        // Step 2 validation: Ensure an image is uploaded before proceeding
        if (step == 2) {
            if (!imageUpload.imageUploaded) {
                alert('Please upload an image first.');
                return;
            }
        }

        // Step 3 validation: Ensure contours are extracted before proceeding
        if (step == 3) {
            if (!contourExtraction.contourImage) {
                alert('Please extract contours first.');
                return;
            }
        }

        // Update the active step and content
        updateActiveStep(step);

        // Additional actions for step 3
        if (step === 3) {
            contourGeocoding.resizeContainers();
            try {
                const contours = await contourExtraction.getContours();
                contourGeocoding.setContours(contours);
            } catch (error) {
                console.error('Error getting contours:', error);
                alert('Error getting contours. Please try again.');
                return;
            }
        }
    });

    /**
     * Updates the active step and corresponding content.
     * @param {number} step - The step number to activate.
     */
    function updateActiveStep(step) {
        $('.step').removeClass('active');
        $('.step-content').removeClass('active');
        $(`#content-step-${step}`).addClass('active');
        $(`.step[data-step="${step}"]`).addClass('active');
    }
});