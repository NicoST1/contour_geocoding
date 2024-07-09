from flask import Flask
from app import views
from flask_bootstrap import Bootstrap4

def create_app():
    app = Flask(__name__)
    Bootstrap4(app)
    #app.config.from_object('config.Config')
    
    views.init_app(app)
    
    return app