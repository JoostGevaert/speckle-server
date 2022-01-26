import * as THREE from 'three'
import * as Geo from 'geo-three'
import {OSM3} from './osmthree'
//import {Sky} from 'three-sky/src/Sky.js'
const { Sky } = require("three-sky/src/Sky.js");


import Stats from 'three/examples/jsm/libs/stats.module.js'

import ObjectManager from './SceneObjectManager'
import ViewerObjectLoader from './ViewerObjectLoader'
import EventEmitter from './EventEmitter'
import InteractionHandler from './InteractionHandler'
import CameraHandler from './context/CameraHanlder'

import SectionBox from './SectionBox'

import { Units, getConversionFactor } from './converter/Units'

export default class Viewer extends EventEmitter {

  constructor( { container, postprocessing = false, reflections = true, showStats = false } ) {
    super()

    window.THREE = THREE

    this.clock = new THREE.Clock()
    
    this.container = container || document.getElementById( 'renderer' )
    this.postprocessing = postprocessing
    this.scene = new THREE.Scene()

    this.renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true, preserveDrawingBuffer: true } )
    this.renderer.setClearColor( 0xcccccc, 0 )
    this.renderer.setPixelRatio( window.devicePixelRatio )
    this.renderer.setSize( this.container.offsetWidth, this.container.offsetHeight )
    this.container.appendChild( this.renderer.domElement )

    
    this.cameraHandler = new CameraHandler( this )

    this.reflections = reflections
    this.reflectionsNeedUpdate = true
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget( 512, { format: THREE.RGBFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter } )
    this.cubeCamera = new THREE.CubeCamera( 0.1, 10_000, cubeRenderTarget )
    this.scene.add( this.cubeCamera )

    if ( showStats ) {
      this.stats = new Stats()
      this.container.appendChild( this.stats.dom )
    }

    window.addEventListener( 'resize', this.onWindowResize.bind( this ), false )

    this.mouseOverRenderer = false
    this.renderer.domElement.addEventListener( 'mouseover', () => { this.mouseOverRenderer = true } )
    this.renderer.domElement.addEventListener( 'mouseout', () => { this.mouseOverRenderer = false } )
    
    this.loaders = {}

    this.sectionBox = new SectionBox( this )
    this.sectionBox.off()

    this.sceneManager = new ObjectManager( this )
    this.interactions = new InteractionHandler( this )

    
    //TODO: choose maps, get tokens

    //var DEV_MAPBOX_API_KEY = "pk.eyJ1IjoidGVudG9uZSIsImEiOiJjazBwNHU4eDQwZzE4M2VzOGhibWY5NXo5In0.8xpF1DEcT6Y4000vNhjj1g"; // from example
		var DEV_MAPBOX_API_KEY = "pk.eyJ1Ijoia2F0LXNwZWNrbGUiLCJhIjoiY2t5cm1oZDZmMHZkbTJxbzVhdnkxeGYzaCJ9.JXufxeNiDCDDi5JgzUrsbQ"; //Speckle token for localhost only
    //var DEV_HEREMAPS_APP_ID = "HqSchC7XT2PA9qCfxzFq";
		//var DEV_HEREMAPS_APP_CODE = "5rob9QcZ70J-m18Er8-rIA";
		var DEV_BING_API_KEY = "AuViYD_FXGfc3dxc0pNa8ZEJxyZyPq1lwOLPCOydV3f0tlEVH-HKMgxZ9ilcRj-T";
		var DEV_MAPTILER_API_KEY = "B9bz5tIKxl4beipiIbR0"; //from example; https://www.maptiler.com/cloud/ "Free account for personal use and evaluation."
		var OPEN_MAP_TILES_SERVER_MAP = "";
    var sky, sun;
    
    // adding map tiles
    this.map_providers = [
      ["No map"],
			//["Vector Bing Maps", new Geo.BingMapsProvider(DEV_BING_API_KEY, Geo.BingMapsProvider.ROAD),], //works
			//["Satellite Bing Maps", new Geo.BingMapsProvider(DEV_BING_API_KEY, Geo.BingMapsProvider.AERIAL)], //works
			["Mapbox Streets", new Geo.MapBoxProvider(DEV_MAPBOX_API_KEY, "mapbox/streets-v10", Geo.MapBoxProvider.STYLE), 0x8D9194], //works (custom token)
			["Mapbox Monochrome", new Geo.MapBoxProvider(DEV_MAPBOX_API_KEY, "kat-speckle/ckyse56qx2w4h14pe0555b6mt", Geo.MapBoxProvider.STYLE), 0xa4adbf], //works (custom token)
			["Mapbox Satellite", new Geo.MapBoxProvider(DEV_MAPBOX_API_KEY, "mapbox.satellite", Geo.MapBoxProvider.MAP_ID, "jpg70", false),0x595755], //works (custom token)

			["Mapbox Streets 3D Buildings", new Geo.MapBoxProvider(DEV_MAPBOX_API_KEY, "mapbox/streets-v10", Geo.MapBoxProvider.STYLE), 0x8D9194], //works (custom token)
			["Mapbox Monochrome 3D Buildings", new Geo.MapBoxProvider(DEV_MAPBOX_API_KEY, "kat-speckle/ckyse56qx2w4h14pe0555b6mt", Geo.MapBoxProvider.STYLE), 0xa4adbf], //works (custom token)
			["Mapbox Satellite 3D Buildings", new Geo.MapBoxProvider(DEV_MAPBOX_API_KEY, "mapbox.satellite", Geo.MapBoxProvider.MAP_ID, "jpg70", false),0x595755], //works (custom token)

			//["Vector Map Tiler Basic", new Geo.MapTilerProvider(DEV_MAPTILER_API_KEY, "maps", "basic", "png")], //works
			//["Vector Map Tiler Outdoor", new Geo.MapTilerProvider(DEV_MAPTILER_API_KEY, "maps", "outdoor", "png")],	//works
			//["Vector OpenSteet Maps", new Geo.OpenStreetMapsProvider()] // works until specific zoom

		];
    
    this.map_modes = [
			["Planar", Geo.MapView.PLANAR],
			["Height", Geo.MapView.HEIGHT],
			// ["Martini", Geo.MapView.MARTINI],
			["Height Shader", Geo.MapView.HEIGHT_SHADER],
			["Spherical", Geo.MapView.SPHERICAL]
		];

    this.sceneLights()
    this.animate()
    this.onWindowResize()
    this.interactions.zoomExtents()
    this.addUnitsList()
    this.addMapsList()
    //this.initSky()
    this.needsRender = true

    this.inProgressOperations = 0
  }

  sceneLights() {

    // const dirLight = new THREE.DirectionalLight( 0xffffff, 0.1 )
    // dirLight.color.setHSL( 0.1, 1, 0.95 )
    // dirLight.position.set( -1, 1.75, 1 )
    // dirLight.position.multiplyScalar( 1000 )
    // this.scene.add( dirLight )
    
    // const dirLight2 = new THREE.DirectionalLight( 0xffffff, 0.9 )
    // dirLight2.color.setHSL( 0.1, 1, 0.95 )
    // dirLight2.position.set( 0, -1.75, 1 )
    // dirLight2.position.multiplyScalar( 1000 )
    // this.scene.add( dirLight2 )

    // const hemiLight2 = new THREE.HemisphereLight( 0xffffff, new THREE.Color( '#232323' ), 1.9 )
    // hemiLight2.color.setHSL( 1, 1, 1 )
    // // hemiLight2.groundColor = new THREE.Color( '#232323' )
    // hemiLight2.up.set( 0, 0, 1 )
    // this.scene.add( hemiLight2 )

    // let axesHelper = new THREE.AxesHelper( 1 )
    // this.scene.add( axesHelper )

    // return


    let ambientLight = new THREE.AmbientLight( 0xffffff )
    this.scene.add( ambientLight )

    const lights = []
    lights[ 0 ] = new THREE.PointLight( 0xffffff, 0.21, 0 )
    lights[ 1 ] = new THREE.PointLight( 0xffffff, 0.21, 0 )
    lights[ 2 ] = new THREE.PointLight( 0xffffff, 0.21, 0 )
    lights[ 3 ] = new THREE.PointLight( 0xffffff, 0.21, 0 )

    let factor = 1000
    lights[ 0 ].position.set( 1 * factor, 1 * factor, 1 * factor )
    lights[ 1 ].position.set( 1 * factor, -1 * factor, 1 * factor )
    lights[ 2 ].position.set( -1 * factor, -1 * factor, 1 * factor )
    lights[ 3 ].position.set( -1 * factor, 1 * factor, 1 * factor )

    this.scene.add( lights[ 0 ] )
    this.scene.add( lights[ 1 ] )
    this.scene.add( lights[ 2 ] )
    this.scene.add( lights[ 3 ] )

    // let sphereSize = 0.2
    // this.scene.add( new THREE.PointLightHelper( lights[ 0 ], sphereSize ) )
    // this.scene.add( new THREE.PointLightHelper( lights[ 1 ], sphereSize ) )
    // this.scene.add( new THREE.PointLightHelper( lights[ 2 ], sphereSize ) )
    // this.scene.add( new THREE.PointLightHelper( lights[ 3 ], sphereSize ) )

    const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x0, 0.2 )
    hemiLight.color.setHSL( 1, 1, 1 )
    hemiLight.groundColor.setHSL( 0.095, 1, 0.75 )
    hemiLight.up.set( 0, 0, 1 )
    this.scene.add( hemiLight )

    
    let group = new THREE.Group()
    this.scene.add( group )
  }

  onWindowResize() {
    this.renderer.setSize( this.container.offsetWidth, this.container.offsetHeight )
    // this.composer.setSize( this.container.offsetWidth, this.container.offsetHeight )
    this.needsRender = true
  }

  animate() {
    const delta = this.clock.getDelta()
    
    const hasControlsUpdated = this.cameraHandler.controls.update( delta )
    // const hasOrthoControlsUpdated = this.cameraHandler.cameras[1].controls.update( delta )

    requestAnimationFrame( this.animate.bind( this ) )

    // you can skip this condition to render though
    if ( hasControlsUpdated || this.needsRender ) {
      this.needsRender = false
      if ( this.stats ) this.stats.begin()
      this.render()
      if( this.stats && document.getElementById( 'info-draws' ) )
        document.getElementById( 'info-draws' ).textContent = '' + this.renderer.info.render.calls
      if ( this.stats ) this.stats.end()
    }

  }

  render() {
    //console.log(this.cameraHandler.activeCam.camera.position)
    if ( this.reflections && this.reflectionsNeedUpdate ) {
      // Note: scene based "dynamic" reflections need to be handled a bit more carefully, or else:
      // GL ERROR :GL_INVALID_OPERATION : glDrawElements: Source and destination textures of the draw are the same.
      // First remove the env map from all materials
      for ( let obj of this.sceneManager.filteredObjects ) {
        obj.material.envMap = null
      }

      // Second, set a scene background color (renderer is transparent by default)
      // and then finally update the cubemap camera.
      this.scene.background = new THREE.Color( '#F0F3F8' )
      this.cubeCamera.update( this.renderer, this.scene )
      this.scene.background = null

      // Finally, re-set the env maps of all materials
      for ( let obj of this.sceneManager.filteredObjects ) {
        obj.material.envMap = this.cubeCamera.renderTarget.texture
      }
      this.reflectionsNeedUpdate = false
    }

    this.renderer.render( this.scene, this.cameraHandler.activeCam.camera )

  }

  toggleSectionBox() {
    this.sectionBox.toggle()
  }

  sectionBoxOff() {
    this.sectionBox.off()
  }

  sectionBoxOn() {
    this.sectionBox.on()
  }

  zoomExtents( fit, transition ) {
    this.interactions.zoomExtents( fit, transition )
  }

  setProjectionMode( mode ) {
    this.cameraHandler.activeCam = mode
  }

  toggleCameraProjection() {
    this.cameraHandler.toggleCameras()
  }

  async loadObject( url, token, enableCaching = true ) {
    try {
      if ( ++this.inProgressOperations === 1 ) this.emit( 'busy', true )

      let loader = new ViewerObjectLoader( this, url, token, enableCaching )
      this.loaders[ url ] = loader
      await loader.load()
    } finally {
       if ( --this.inProgressOperations === 0 ) this.emit( 'busy', false )
       console.log(this.scene)
    }

  }

  async cancelLoad( url, unload = false ) {
    this.loaders[url].cancelLoad()
    if( unload ) {
      await this.unloadObject( url )
    }
    return
  }

  async unloadObject( url ) {
    try {
      if ( ++this.inProgressOperations === 1 ) this.emit( 'busy', true )

      await this.loaders[ url ].unload()
      delete this.loaders[ url ]
    } finally {
       if ( --this.inProgressOperations === 0 ) this.emit( 'busy', false )
    }
  }

  async unloadAll() {
    for( let key of Object.keys( this.loaders ) ) {
      await this.loaders[key].unload()
      delete this.loaders[key]
    }
    await this.applyFilter( null )
    return
  }

  async applyFilter( filter ) {
    try {
      if ( ++this.inProgressOperations === 1 ) this.emit( 'busy', true )

      this.interactions.deselectObjects()
      return await this.sceneManager.sceneObjects.applyFilter( filter )
    } finally {
       if ( --this.inProgressOperations === 0 ) this.emit( 'busy', false )
    }

  }

  getObjectsProperties( includeAll = true ) {
    return this.sceneManager.sceneObjects.getObjectsProperties( includeAll )
  }

  dispose() {
    // TODO: currently it's easier to simply refresh the page :)
  }

  
  addUnitsList(){
    var mapUnits = document.getElementById("mapUnits");

    for (var key of Object.keys(Units) ) {
      var option = document.createElement("option");
      option.innerHTML = Units[key];
      mapUnits.appendChild(option);
    }

  }

  addMapsList(){
    var providerColor = document.getElementById("providerColor");

    for (var i = 0; i < this.map_providers.length ; i++) {
      var option = document.createElement("option");
      option.innerHTML = this.map_providers[i][0];
      providerColor.appendChild(option);
    }
  }
  async addMap() {
    // example building https://latest.speckle.dev/streams/8b29ca2b2e/objects/288f67a0a45b2a4c3bd01f7eb3032495
    var providerColor = document.getElementById("providerColor");
    this.removeMap();

    if (providerColor.selectedIndex <=3 ) this.hideBuild(); // hide if there should NOT be buildings
    if (providerColor.selectedIndex >3 && !this.scene.getObjectByName("OSM 3d buildings"))  this.addBuildings(); // add if there should be buildings, but not are in the scene yet
    if (providerColor.selectedIndex >3 && this.scene.getObjectByName("OSM 3d buildings"))   this.showBuild(); // show and change color if there should be buildings, and they are already in the scene

    if (providerColor.selectedIndex >0){
        //create and add map to scene
        var map = new Geo.MapView(this.map_modes[0][1], this.map_providers[providerColor.selectedIndex][1], this.map_providers[providerColor.selectedIndex][1]);
        map.name = "Base map"
        this.scene.add(map);
        map.rotation.x += Math.PI/2;

        //set selected map provider
        await map.setProvider(this.map_providers[providerColor.selectedIndex][1]);

        var coords = this.getCoords()[0];
        var scale = this.getScale();
        //console.log(coords)
              
        map.scale.set(map.scale.x/scale, map.scale.y/scale, map.scale.z/scale)
        map.position.x -= coords.x/scale; // to the East
        map.position.y -= coords.y/scale; // to the North 
        
        this.interactions.rotateCamera(0.001) //to activate map loading
    }
  }
  getScale(){
    var scale = 0.001; //mm
    var scale_units = "mm"
    scale_units = document.getElementById("mapUnits").value;
    scale = getConversionFactor(scale_units);
    return scale
  }
  getCoords(){
    // get and transform coordinates
    var coord_x = Number(document.getElementById( 'zeroCoordInputX' ).value)
    var coord_y = Number(document.getElementById( 'zeroCoordInputY' ).value)
    var coords_transformed = Geo.UnitsUtils.datumsToSpherical(coord_x,coord_y)
    return [coords_transformed, coord_x, coord_y]; // 51.506810732490656, -0.0892642750895124
  }
  addBuildings(){
    var scale = this.getScale();
    var coord_x = this.getCoords()[1];
    var coord_y = this.getCoords()[2];

    var color = 0x8D9194; //grey
    //color = 0xa3a3a3; //light grey
    //color = 0x4287f5; //blue
    color = this.map_providers[providerColor.selectedIndex][2]

    //var material = this.sceneManager.solidMaterial;
    let material = this.sceneManager.solidMaterial.clone()
    material.color = new THREE.Color(color);
    window.OSM3.makeBuildings( this.scene, [ coord_y-0.01, coord_x-0.01, coord_y+0.01, coord_x+0.01 ], { scale: scale, color: color, material: material } );
    
    this.render();
  }
  removeMap(){
    var selectedObject = this.scene.getObjectByName("Base map")
    this.scene.remove( selectedObject );    
    this.render();
  }
  hideBuild(){
    this.scene.traverse(function(child) {
      if (child.name === "OSM 3d buildings") {
        child.visible = false;
      }
    });
    this.render();
  }
  showBuild(){
    var c = this.map_providers[providerColor.selectedIndex][2]
    var mat = this.sceneManager.solidMaterial.clone()
    this.scene.traverse(function(child) {
      if (child.name === "OSM 3d buildings") {
        mat.color = new THREE.Color(c);
        child.material = mat;
        child.visible = true;
      }
    });
    this.render();
  }
  
  initSky() {
        //const Sky = require('three-sky');
				// Add Sky
        const Sky = require('three-sky');
				this.sky = new Sky();
				this.sky.scale.setScalar( 450000 );
				this.scene.add( sky );

				this.sun = new THREE.Vector3();

				/// GUI

				const effectController = {
					turbidity: 10,
					rayleigh: 3,
					mieCoefficient: 0.005,
					mieDirectionalG: 0.7,
					elevation: 2,
					azimuth: 180,
					exposure: renderer.toneMappingExposure
				};

				function guiChanged() {

					const uniforms = sky.material.uniforms;
					uniforms[ 'turbidity' ].value = effectController.turbidity;
					uniforms[ 'rayleigh' ].value = effectController.rayleigh;
					uniforms[ 'mieCoefficient' ].value = effectController.mieCoefficient;
					uniforms[ 'mieDirectionalG' ].value = effectController.mieDirectionalG;

					const phi = THREE.MathUtils.degToRad( 90 - effectController.elevation );
					const theta = THREE.MathUtils.degToRad( effectController.azimuth );

					sun.setFromSphericalCoords( 1, phi, theta );

					uniforms[ 'sunPosition' ].value.copy( sun );

					renderer.toneMappingExposure = effectController.exposure;
					renderer.render( this.scene, camera );

				}

				const gui = new GUI();

				gui.add( effectController, 'turbidity', 0.0, 20.0, 0.1 ).onChange( guiChanged );
				gui.add( effectController, 'rayleigh', 0.0, 4, 0.001 ).onChange( guiChanged );
				gui.add( effectController, 'mieCoefficient', 0.0, 0.1, 0.001 ).onChange( guiChanged );
				gui.add( effectController, 'mieDirectionalG', 0.0, 1, 0.001 ).onChange( guiChanged );
				gui.add( effectController, 'elevation', 0, 90, 0.1 ).onChange( guiChanged );
				gui.add( effectController, 'azimuth', - 180, 180, 0.1 ).onChange( guiChanged );
				gui.add( effectController, 'exposure', 0, 1, 0.0001 ).onChange( guiChanged );

				guiChanged();

			}

  
}
