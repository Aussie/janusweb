elation.require(['engine.things.generic', 'utils.template'], function() {
  elation.template.add('janusweb.edit.object', 
      '<Object id=^{id}^ js_id=^{js_id}^ locked=^false^ pos=^{pos.x} {pos.y} {pos.z}^ vel=^{vel.x} {vel.y} {vel.z}^ accel=^{accel.x} {accel.y} {accel.z}^ xdir=^{xdir}^ ydir=^{ydir}^ zdir=^{zdir}^ scale=^{scale.x} {scale.y} {scale.z}^ col=^{col}^ lighting=^{lighting}^ visible=^{visible}^ />');

  elation.component.add('engine.things.janusbase', function() {
    this.defaultcolor = new THREE.Color(0xffffff);

    this.postinit = function() {
      elation.engine.things.janusbase.extendclass.postinit.call(this);
      this.frameupdates = [];
      this.jschildren = [];
      this.assets = {};
      this.defineProperties({
        room:     { type: 'object' },
        janus:    { type: 'object' },
        js_id:    { type: 'string' },
        color:    { type: 'color', default: this.defaultcolor, set: this.updateColor },
        opacity:  { type: 'float', default: 1.0, set: this.updateOpacity },
        fwd:      { type: 'vector3', default: new THREE.Vector3(0,0,1), set: this.pushFrameUpdate },
        xdir:     { type: 'vector3', default: new THREE.Vector3(1,0,0), set: this.pushFrameUpdate },
        ydir:     { type: 'vector3', default: new THREE.Vector3(0,1,0), set: this.pushFrameUpdate },
        zdir:     { type: 'vector3', default: new THREE.Vector3(0,0,1), set: this.pushFrameUpdate },
        rotation: { type: 'euler', default: new THREE.Euler(0,0,0), set: this.pushFrameUpdate },
        rotation_order: { type: 'string', default: 'XYZ', set: this.pushFrameUpdate },
        lighting: { type: 'boolean', default: true },
        sync:     { type: 'boolean', default: false },
        locked:   { type: 'boolean', default: false },
        rotate_axis: { type: 'string', default: '0 1 0' },
        rotate_deg_per_sec: { type: 'string' },
        onclick: { type: 'object' },
        anim_id: { type: 'string' },
        anim_transition_time: { type: 'float', default: .2 },
      });

      this.eventlistenerproxies = {};
      //if (this.col) this.color = this.col;
      elation.events.add(this.room, 'janusweb_script_frame_end', elation.bind(this, this.handleFrameUpdates));
      this.colorIsDefault = true;

      if (this.onclick) {
        if (elation.utils.isString(this.onclick)) {
          elation.events.add(this, 'click', elation.bind(this, function() { 
            eval(this.onclick);
          }));
          
        } else {
          elation.events.add(this, 'click', elation.bind(this, this.onclick));
        }
      }
    }
    this.updateColor = function() {
      if (this.properties.color === this.defaultcolor) {
        if (this.color.r != 1 || this.color.g != 1 || this.color.b != 1) {
          this.properties.color = this.properties.color.clone();
          this.defaultcolor.setRGB(1,1,1);
          this.colorIsDefault = false;
        }
      }
    }
    this.updateOpacity = function() {
      this.setOpacity(this.opacity);
    }
    this.createForces = function() {
      elation.events.add(this.objects.dynamics, 'physics_collide', elation.bind(this, this.handleCollision));

      var rotate_axis = this.properties.rotate_axis,
          rotate_speed = this.properties.rotate_deg_per_sec;
      if (rotate_axis && rotate_speed) {
        var speed = (rotate_speed * Math.PI/180);
        var axisparts = rotate_axis.split(' ');
        var axis = new THREE.Vector3().set(axisparts[0], axisparts[1], axisparts[2]);
        axis.multiplyScalar(speed);
        this.objects.dynamics.setAngularVelocity(axis);
      }

    }
    this.setProperties = function(props) {
      var n = this.janus.parser.parseNode(props);
      var rebuild = false;

      if (n.pos) this.properties.position.fromArray(n.pos);
      if (n.scale) this.properties.scale.fromArray(n.scale);
      if (n.orientation) this.properties.orientation.copy(n.orientation);
  
      if (n.id && n.id != this.properties.render.model) {
        this.properties.render.model = n.id;
        rebuild = true;
      }
      var curcol = this.properties.col || [1,1,1];
      if (n.col && (n.col[0] != curcol[0] || n.col[1] != curcol[1] || n.col[2] != curcol[2])) {
        this.properties.col = n.col;
        rebuild = true;
      }
      if (rebuild) {
        //this.set('visible', true, true);
      }
      if (n.accel) this.properties.acceleration.fromArray(n.accel.split(' ').map(parseFloat));
      if (n.vel) this.objects.dynamics.setVelocity(this.properties.velocity.fromArray(n.vel.split(' ').map(parseFloat)));
      this.refresh();
    } 
    this.summarizeXML = function() {
      //'<Object id=^{id}^ js_id=^{js_id}^ locked=^false^ pos=^{pos.x} {pos.y} {pos.z}^ vel=^{vel.x} {vel.y} {vel.z}^ accel=^{accel.x} {accel.y} {accel.z}^ xdir=^{xdir}^ ydir=^{ydir}^ zdir=^{zdir}^ scale=^{scale.x} {scale.y} {scale.z}^ col=^{color}^ lighting=^{lighting}^ visible=^{visible}^ />');

      var matrix = new THREE.Matrix4().makeRotationFromQuaternion(this.properties.orientation);
      var xdir = new THREE.Vector3(),
          ydir = new THREE.Vector3(),
          zdir = new THREE.Vector3();
      matrix.extractBasis(xdir, ydir, zdir);

      var objdef = {
        id: this.properties.render.model,
        js_id: this.properties.js_id,
        pos: this.properties.position,
        vel: this.properties.velocity,
        accel: this.properties.acceleration,
        scale: this.properties.scale,
        xdir: xdir.toArray().join(' '),
        ydir: ydir.toArray().join(' '),
        zdir: zdir.toArray().join(' '),
        col: this.properties.color,
        lighting: this.properties.lighting,
        visible: this.properties.visible,
      };

      var xml = elation.template.get('janusweb.edit.object', objdef);
      return xml;
    }
    this.getProxyObject = function(classdef) {
      if (!this._proxyobject) {
        this._proxyobject = new elation.proxy(this, {
          parent:   ['accessor', 'parent.getProxyObject'],
          children: ['accessor', 'getChildProxies'],
          js_id:    ['property', 'properties.js_id'],
          pos:      ['property', 'position'],
          vel:      ['property', 'velocity'],
          accel:    ['property', 'acceleration'],
          mass:     ['property', 'mass'],
          scale:    ['property', 'scale'],
          col:      ['property', 'color'],
          opacity:  ['property', 'opacity'],
          fwd:      ['property', 'zdir'],
          xdir:     ['property', 'xdir'],
          ydir:     ['property', 'ydir'],
          zdir:     ['property', 'zdir'],
          rotation: ['property', 'rotation'],
          rotation_order: ['property', 'rotation_order'],
          sync:     ['property', 'sync'],
          locked:   ['property', 'sync'],
          visible:  ['property', 'visible'],

          onupdate:     ['callback', 'update'],
          oncollision:  ['callback', 'collision'],
          onmouseover:  ['callback', 'mouseover'],
          onmouseout:   ['callback', 'mouseout'],
          onmousemove:  ['callback', 'mousemove'],
          onmousedown:  ['callback', 'mousedown'],
          onmouseup:    ['callback', 'mouseup'],
          onclick:      ['callback', 'click'],
          ontouchstart: ['callback', 'touchstart'],
          ontouchmove:  ['callback', 'touchmove'],
          ontouchend:   ['callback', 'touchend'],
          ondragover:   ['callback', 'dragover'],
          ondrag:       ['callback', 'drag'],
          ondragenter:  ['callback', 'dragenter'],
          ondragleave:  ['callback', 'dragleave'],
          ondragstart:  ['callback', 'dragstart'],
          ondragend:    ['callback', 'dragend'],
          ondrop:       ['callback', 'drop'],

          createObject:        ['function', 'createObject'],
          appendChild:         ['function', 'appendChild'],
          addEventListener:    ['function', 'addEventListenerProxy'],
          removeEventListener: ['function', 'removeEventListenerProxy'],
          localToWorld:        ['function', 'localToWorld'],
          worldToLocal:        ['function', 'worldToLocal'],
          distanceTo:          ['function', 'distanceTo'],
          addForce:            ['function', 'addForce'],
          removeForce:         ['function', 'removeForce'],
          die:                 ['function', 'die'],
          executeCallback:     ['function', 'executeCallback'],
          isEqual:             ['function', 'isEqual']
        });

        if (classdef) {
          var propertydefs = {},
              proxydefs = {};
          for (var k in classdef.class) {
            var v = classdef.class[k];
            var proxytype = 'property';
            if (typeof v == 'function') {
              proxytype = 'function';
              this._proxyobject[k] = elation.bind(this._proxyobject, v);
            } else {
              propertydefs[k] = {type: 'object', default: v };
            }
            proxydefs[k] = [proxytype, k];
          }
          this.defineProperties(propertydefs);
          this._proxyobject._proxydefs = proxydefs;
        }
      }
      return this._proxyobject;
    }
    this.getChildProxies = function() {
      var childproxies = [];
      for (var k in this.children) {
        childproxies.push(this.children[k]._proxyobject);
      }
      return childproxies;
    }
    this.getAsset = function(type, id) {
      if (!this.assets[type]) {
        this.assets[type] = {};
      }
      var asset = this.assets[type][id] = this.room.getAsset(type, id);
      return asset;
    }
    this.getActiveAssets = function(assetlist) {
      if (assetlist) {
        for (var type in this.assets) {
          if (!assetlist[type]) assetlist[type] = {};
          for (var url in this.assets[type]) {
            assetlist[type][url] = this.assets[type][url];
          }
        }
      }
      return this.assets;
    }
    this.start = function() {
    }    
    this.stop = function() {
    }    
    this.pushFrameUpdate = function(key, value) {
//console.log('frame update!', key, value);
      this.frameupdates[key] = value;
    }
    this.handleFrameUpdates = function(ev) {
      this.dispatchEvent({type: 'update', data: ev.data});

      var updatenames = Object.keys(this.frameupdates);
      var xdir = this.properties.xdir,
          ydir = this.properties.ydir,
          zdir = this.properties.zdir,
          m = this.objects['3d'].matrix.elements;
      var diff = (
          xdir.x != m[0] || xdir.y != m[1] || xdir.z != m[2] ||
          ydir.x != m[4] || ydir.y != m[5] || ydir.z != m[6] ||
          zdir.x != m[8] || zdir.y != m[9] || zdir.z != m[10]
      );
      if (updatenames.length > 0 || diff) {
        var updates = this.frameupdates;
        if ('rotation' in updates) {
        }
        if ('fwd' in updates) {
          this.properties.zdir.copy(this.fwd);
          updates.zdir = this.properties.zdir;
        }

        if ( ('xdir' in updates) && 
            !('ydir' in updates) && 
            !('zdir' in updates)) {
          zdir.crossVectors(xdir, ydir);
          this.updateVectors(true);
        } 
        if (!('xdir' in updates) && 
            !('ydir' in updates) && 
             ('zdir' in updates)) {
          xdir.crossVectors(ydir, zdir);
          this.updateVectors(true);
        } 
        if (!('xdir' in updates) && 
             ('ydir' in updates) && 
             ('zdir' in updates)) {
          xdir.crossVectors(zdir, ydir);
          this.updateVectors(true);
        } 
        if ( ('xdir' in updates) && 
            !('ydir' in updates) && 
             ('zdir' in updates)) {
          ydir.crossVectors(xdir, zdir).multiplyScalar(-1);
          this.updateVectors(true);
        } 
        if ( ('xdir' in updates) && 
             ('ydir' in updates) && 
            !('zdir' in updates)) {
          zdir.crossVectors(xdir, ydir);
          this.updateVectors(true);
        } 

        if (!('xdir' in updates) && 
            !('ydir' in updates) && 
            !('zdir' in updates)) {
          // None specified, so update the vectors from the orientation quaternion
          this.updateVectors(false);
        }
        this.frameupdates = {};
      } else {
        this.updateVectors(false);
      }
    }
    this.updateVectors = (function() {
      // Closure scratch variables
      var mat4 = new THREE.Matrix4();
      var quat = new THREE.Quaternion();
      var pos = new THREE.Vector3();
      var scale = new THREE.Vector3();

      return function(updateOrientation) {
        if (updateOrientation) {
          mat4.makeBasis(this.properties.xdir, this.properties.ydir, this.properties.zdir);

          quat.setFromRotationMatrix(mat4);
          this.properties.orientation.copy(quat);
          this.properties.rotation.setFromRotationMatrix(mat4);
        } else if (this.objects['3d']) {
          //this.objects['3d'].matrix.extractBasis(this.properties.xdir, this.properties.ydir, this.properties.zdir);
        }
      };
    })();
    this.createObject = function(type, args) {
      return room.createObject(type, args, this);
    }
    this.appendChild = function(obj) {
      var proxyobj = obj
      if (elation.utils.isString(obj)) {
        proxyobj = this.room.jsobjects[obj];
      }
      if (proxyobj) {
        //var realobj = this.room.getObjectFromProxy(proxyobj);
        var realobj = proxyobj._target;
        if (realobj) {
          this.add(realobj);
          this.updateScriptChildren();
        }
      }
    }
    this.removeChild = function(obj) {
      var proxyobj = obj
      if (elation.utils.isString(obj)) {
        proxyobj = this.room.jsobjects[obj];
      }
      if (proxyobj) {
        //var realobj = this.room.getObjectFromProxy(proxyobj);
        var realobj = proxyobj._target;
        if (realobj) {
          this.remove(realobj);
          this.updateScriptChildren();
        }
      }
    }
    this.updateScriptChildren = function() {
      this.jschildren = [];
      var keys = Object.keys(this.children);
      for (var i = 0; i < keys.length; i++) {
        this.jschildren.push(this.children[keys[i]].getProxyObject());
      }
    }
    this.handleCollision = function(ev) {
      var obj1 = ev.data.bodies[0],
          obj2 = ev.data.bodies[1];
      //var proxy1 = obj1.getProxy(),
      //    proxy2 = obj2.getProxy();
      var other = (obj1.object == this ? obj2.object : obj1.object);
      if (other) {
        if (other.getProxyObject) {
          var proxy = other.getProxyObject();
          //console.log('I collided', proxy, this);
          elation.events.fire({type: 'collision', element: this, data: proxy});

          if (proxy.collision_trigger) {
            ev.preventDefault();
            ev.stopPropagation();
          }
        } else {
console.error('dunno what this is', other);
        }
      }
    }
    this.setOpacity = function(opacity) {
      if (this.objects['3d']) {
        this.objects['3d'].traverse(function(n) {
          if (n.material) {
            var m = (elation.utils.isArray(n.material) ? n.material : [n.material]);
            for (var i = 0; i < m.length; i++) {
              m[i].opacity = opacity;
              m[i].transparent = (opacity < 1);
              if (m[i].transparent) {
                m[i].alphaTest = 0.02;
              }
            }
          }
        });
      }
    }
    this.setAnimation = function(anim_id) {
      if (!this.activeanimation || anim_id != this.anim_id) {
        if (!this.animationmixer) return;
        if (this.activeanimation) {
          //console.log('pause active animation', this.activeanimation);
          // TODO - interpolating between actions would make transitions smoother
          this.activeanimation.stop();
        }
        if (this.animationactions && this.animationactions[anim_id]) {
          var action = this.animationactions[anim_id];
          //console.log('found action!', anim_id, action);
          action.play();
          this.activeanimation = action;
        }
        this.anim_id = anim_id;
      }
    }
    this.dispatchEvent = function(event) {
      if (!event.element) event.element = this;
      return elation.events.fire(event);
    }
    this.addEventListenerProxy = function(name, handler, bubble) {
      var eventobj = {
        target: handler,
        fn: function(ev) {
          var proxyev = elation.events.clone(ev, {
            target: ev.target.getProxyObject(),
          });
          // Bind stopPropagation and preventDefault functions to the real event
          proxyev.stopPropagation = elation.bind(ev, ev.stopPropagation),
          proxyev.preventDefault = elation.bind(ev, ev.preventDefault),
          handler(proxyev);
        }
      };
      if (!this.eventlistenerproxies[name]) this.eventlistenerproxies[name] = [];
      this.eventlistenerproxies[name].push(eventobj);

      elation.events.add(this, name, eventobj.fn, bubble);
    }
    this.removeEventListenerProxy = function(name, handler, bubble) {
      if (this.eventlistenerproxies[name]) {
        for (var i = 0; i < this.eventlistenerproxies[name].length; i++) {
          var evproxy = this.eventlistenerproxies[name][i];
          if (evproxy.target === handler) {
            elation.events.remove(this, name, evproxy.fn, bubble);
          }
        }
      }
    }
    this.executeCallback = function(callback, args) {
      if (callback instanceof Function) {
        callback(args);
      } else if (elation.utils.isString(callback)) {
        eval(callback);
      }
    }
    this.isEqual = function(obj) {
      var realobj = obj.target || obj;
      return this === realobj;
    }
  }, elation.engine.things.generic);
});
