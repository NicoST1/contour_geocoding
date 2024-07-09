from flask import render_template, request, jsonify, url_for
from app.contour_extraction import cluster, encode_image, decode_image, preprocess, extract_contours, extract_contour_image, apply_homography, apply_affine_transform
import json
import numpy as np


def init_app(app):

    @app.route('/')
    def index():
        return render_template('index.html')
    
    @app.route('/get_colours', methods=['POST'])
    def get_colours():
        """
        Get the n most dominant colours in the image.
        User will then select the colours of the contours of interest.
        """
        image = decode_image(request.files['image'])  
        alpha = float(request.form['contrast_alpha'])
        beta = float(request.form['contrast_beta'])
        n_clusters = int(request.form['n_clusters'])
        processed_image, colours = cluster(image, alpha, beta, n_clusters)
        return jsonify({'image': encode_image(processed_image), 'colours': colours})
    
    @app.route('/get_contour_image', methods=['POST'])
    def get_contour_image():
        """
        Extract contours from the image based on the preprocessing params and selected colours.
        """
        image = decode_image(request.files['image'])  
        alpha = float(request.form['contrast_alpha'])
        beta = float(request.form['contrast_beta'])
        dilate_iter = int(request.form['dilate_iterations'])
        erode_iter = int(request.form['erode_iterations'])
        min_area = int(request.form['min_contour_area'])
        centroid_colours = np.array(json.loads(request.form['centroid_colours']))
        selected_colours = np.array(json.loads(request.form['selected_colours']))
        erased_rectangles = json.loads(request.form['erased_rectangles'])

        processed_image = preprocess(image, alpha, beta)

        contour_image = extract_contour_image(processed_image, centroid_colours, selected_colours, 
                                                   dilate_iter, erode_iter, min_area, erased_rectangles)

        return jsonify({'image': encode_image(contour_image)})
    
    @app.route('/get_contours', methods=['POST'])
    def get_contours():
        """
        Get the contour coordinates of the image.
        """
        image = decode_image(request.files['image'])  
        contours = extract_contours(image)
        return jsonify({'contours': contours})
    
    @app.route('/transform_contours', methods=['POST'])
    def transform_contours():
        """
        Apply affine transformation to convert points from image coordinates to lat/lon coordinates.
        """
        contours = json.loads(request.form['contours'])
        point_pairs = json.loads(request.form['point_pairs'])
        transformed_contours = apply_affine_transform(contours, point_pairs)
        return jsonify({'trans_contours': transformed_contours})
