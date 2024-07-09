class ImageUpload {
    constructor(name) {
        this.name = name;
        this.imageUploaded = false;
        this.file = null;
        this.imgSrc = null;
        this.init();
    }

    /**
     * Initializes event listeners for image upload functionality.
     */
    init() {
        // Open file dialog when upload box is clicked
        $("#upload-box").on("click", () => {
            $("#image-input").click();
        });

        // Handle image file selection and display the image
        $("#image-input").on("change", (e) => {
            this.file = e.target.files[0];
            this.displayImage(e.target);
            $("#upload-info").hide();
        });
    }

    /**
     * Displays the selected image in the designated image container.
     * @param {HTMLElement} input - The file input element.
     */
    displayImage(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                $('#selected-image').attr('src', e.target.result).show();
                this.imgSrc = e.target.result;
                this.imageUploaded = true;
            };
            reader.readAsDataURL(input.files[0]);
        }
    }
}