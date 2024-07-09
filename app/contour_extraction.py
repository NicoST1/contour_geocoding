from flask import render_template, request, jsonify, url_for # type: ignore
import cv2 # type: ignore
import numpy as np
from sklearn.cluster import KMeans # type: ignore
from sklearn.cluster import MiniBatchKMeans # type: ignore
import base64

def decode_image(blob):
    """
    Decode the image from base64 format.
    """
    raw_data = blob.read()
    nparr = np.frombuffer(raw_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)        
    return img

def encode_image(image):
    """
    Encode the image to base64 format.
    """
    _, buffer = cv2.imencode('.jpg', image)
    return base64.b64encode(buffer).decode('utf-8')

def preprocess(image, alpha, beta):
    """
    Apply contrast adjustment to the image.
    """
    image = cv2.convertScaleAbs(image, alpha=alpha, beta=beta)
    return image

def cluster(image, alpha, beta, n_clusters):
    """
    Apply KMeans clustering to the image to get the n most dominant colours.
    """
    image = preprocess(image, alpha, beta)
    data = image.reshape((-1, 3))
    kmeans = MiniBatchKMeans(n_init='auto', n_clusters=n_clusters, 
                                random_state=0, batch_size=500)
    kmeans.fit(data)
    colors = kmeans.cluster_centers_.astype(int).tolist()
    return image, colors

def _apply_dilation(image, dilate_iters):
    """
    Apply dilation to the image.
    """
    if dilate_iters > 0:
        dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        image = cv2.dilate(image, dilate_kernel, iterations=dilate_iters)
    return image

def _apply_erosion(image, erode_iters):
    """
    Apply erosion to the image.
    """
    if erode_iters > 0:
        erode_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        image = cv2.erode(image, erode_kernel, iterations=erode_iters)
    return image

def _filter_contours(contours, min_area):
    """
    Filter out contours with area less than min_area.
    """
    if min_area <= 0:
        return contours
    return [contour for contour in contours if cv2.contourArea(contour) >= min_area]

def _get_centroid_image(image, centroid_colours):
    """
    Assign each pixel in the image to the closest centroid colour.
    """
    flat_image = image.reshape(-1, 3)
    # Calculate the Euclidean distance from each pixel to each centroid
    distances = np.linalg.norm(flat_image[:, None] - centroid_colours[None, :], axis=2)
    # Find the index of the closest centroid for each pixel
    closest_centroids = np.argmin(distances, axis=1)
    # Map the indices of the closest centroids to the actual colours
    centroid_image = centroid_colours[closest_centroids]
    # Reshape closest_colours back to the image shape
    centroid_image = centroid_image.reshape(image.shape)

    return centroid_image

def extract_contour_image(image, centroid_colours, selected_colours, dilate_iter, erode_iter, min_area,
                     erased_rectangles):
    
    """
    Extract contours from the image based on the selected colours.
    Draw the contours on a blank image and return it.
    """
    
    image_shape = image.shape
    centroid_image = _get_centroid_image(image, centroid_colours)

    # create mask only keeping selected colours
    mask = np.zeros(image_shape[:2], dtype=np.uint8)
    for colour in selected_colours:
        mask[np.all(centroid_image == colour, axis=2)] = 255

    # remove rectangles from mask
    for rect in erased_rectangles:
        mask[rect['y']:rect['y']+rect['height'], rect['x']:rect['x']+rect['width']] = 0

    # Apply dilation to connect gaps in the contour
    mask = _apply_dilation(mask, dilate_iter)

    # Find and draw contours of area greater than min_contour_area
    result_image = np.zeros((image_shape[0], image_shape[1], 3), dtype=np.uint8)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = _filter_contours(contours, min_area)
    cv2.drawContours(result_image, contours, -1, (0, 255, 0), cv2.FILLED)

    # Apply erosion after drawing the contour so the contour is not lost
    result_image = _apply_erosion(result_image, erode_iter)

    return result_image


def extract_contours(image):
    """
    Extract contour coordinates from the image.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours_list = [contour.reshape(-1, 2).tolist() for contour in contours]
    return contours_list


def apply_homography(contours, point_pairs):
    """
    Use point pairs to calculate the homography matrix.
    Apply the transformation to the list of contours.
    """
    src_points = np.array([[pt[0]['x'], pt[0]['y']] for pt in point_pairs], dtype='float32')
    dst_points = np.array([[pt[1]['x'], pt[1]['y']] for pt in point_pairs], dtype='float32')

    H, _ = cv2.findHomography(src_points, dst_points)

    transformed_contours = []
    for contour in contours:
        contour_array = np.array(contour, dtype='float32')
        contour_array = contour_array.reshape(-1, 1, 2)
        transformed_contour = cv2.perspectiveTransform(contour_array, H)
        transformed_contour = transformed_contour.reshape(-1, 2)
        transformed_contours.append(transformed_contour.tolist())

    return transformed_contours

def apply_affine_transform(contours, point_pairs):
    """
    Use point pairs to calculate the affine transformation matrix.
    Apply the transformation to the list of contours.
    """

    src_points = np.array([[pt[0]['x'], pt[0]['y']] for pt in point_pairs[:3]], dtype='float32')
    dst_points = np.array([[pt[1]['x'], pt[1]['y']] for pt in point_pairs[:3]], dtype='float32')

    M = cv2.getAffineTransform(src_points, dst_points)

    transformed_contours = []
    for contour in contours:
        transformed_contour = cv2.transform(np.array([contour], dtype='float32'), M)
        transformed_contours.append(transformed_contour[0].tolist())

    return transformed_contours


