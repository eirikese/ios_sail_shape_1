// Wait for OpenCV.js to be ready
cv['onRuntimeInitialized'] = () => {
    init();
  };
  
  function init() {
    // Access the camera and start processing
    startCamera();
  }
  
  // Global variables
  let video = document.getElementById('video');
  let canvasOutput = document.getElementById('canvasOutput');
  let canvasCtx = canvasOutput.getContext('2d');
  let streaming = false;
  
  // Three.js variables
  let scene, camera, renderer, controls;
  let axes = [];
  let points = [];
  let curves = [];
  
  function startCamera() {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(function (stream) {
        video.srcObject = stream;
        video.play();
      })
      .catch(function (err) {
        console.error('Error accessing the camera: ' + err);
      });
  
    video.addEventListener(
      'canplay',
      function () {
        if (!streaming) {
          video.setAttribute('width', video.videoWidth);
          video.setAttribute('height', video.videoHeight);
          canvasOutput.width = video.videoWidth;
          canvasOutput.height = video.videoHeight;
          streaming = true;
          startProcessing();
          initThreeJS();
          animate();
        }
      },
      false
    );
  }
  
  function startProcessing() {
    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let gray = new cv.Mat();
    let cap = new cv.VideoCapture(video);
    let dictionary = new cv.aruco_Dictionary(cv.DICT_4X4_50);
    let parameters = new cv.aruco_DetectorParameters();
  
    // Camera calibration data (placeholders, replace with actual calibration)
    let cameraMatrix = cv.matFromArray(3, 3, cv.CV_64F, [
      800,
      0,
      video.videoWidth / 2,
      0,
      800,
      video.videoHeight / 2,
      0,
      0,
      1,
    ]);
    let distCoeffs = new cv.Mat.zeros(5, 1, cv.CV_64F);
  
    function processVideo() {
      try {
        cap.read(src);
        cv.flip(src, src, 1); // Mirror the image
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  
        let corners = new cv.MatVector();
        let ids = new cv.Mat();
        let rejected = new cv.MatVector();
  
        cv.detectMarkers(gray, dictionary, corners, ids, parameters, rejected);
  
        if (ids.size().height > 0) {
          // Draw detected markers
          cv.drawDetectedMarkers(src, corners, ids);
  
          // Estimate pose of each marker
          let rvecs = new cv.Mat();
          let tvecs = new cv.Mat();
          let markerLength = 0.05; // Adjust based on your actual marker size in meters
  
          cv.estimatePoseSingleMarkers(
            corners,
            markerLength,
            cameraMatrix,
            distCoeffs,
            rvecs,
            tvecs
          );
  
          for (let i = 0; i < ids.size().height; i++) {
            let id = ids.intAt(i, 0);
            let rvec = new cv.Mat();
            let tvec = new cv.Mat();
            rvec = rvecs.row(i);
            tvec = tvecs.row(i);
  
            // Draw axis for each marker
            cv.drawFrameAxes(
              src,
              cameraMatrix,
              distCoeffs,
              rvec,
              tvec,
              markerLength * 0.5
            );
  
            // Process marker data
            processMarkerData(id, rvec, tvec);
          }
  
          rvecs.delete();
          tvecs.delete();
        }
  
        cv.imshow('canvasOutput', src);
        requestAnimationFrame(processVideo);
      } catch (err) {
        console.error(err);
      }
    }
    requestAnimationFrame(processVideo);
  }
  
  // Variables for marker data
  let markerData = {
    0: null,
    1: null,
    2: null,
    3: null, // Reference marker
  };
  
  // Process marker data and update the 3D scene
  function processMarkerData(id, rvec, tvec) {
    // Convert rotation vector to rotation matrix
    let rotMatrix = new cv.Mat();
    cv.Rodrigues(rvec, rotMatrix);
  
    // Convert rotation matrix to Three.js matrix
    let rotation = new THREE.Matrix4();
    rotation.set(
      rotMatrix.doubleAt(0, 0),
      rotMatrix.doubleAt(0, 1),
      rotMatrix.doubleAt(0, 2),
      0,
      rotMatrix.doubleAt(1, 0),
      rotMatrix.doubleAt(1, 1),
      rotMatrix.doubleAt(1, 2),
      0,
      rotMatrix.doubleAt(2, 0),
      rotMatrix.doubleAt(2, 1),
      rotMatrix.doubleAt(2, 2),
      0,
      0,
      0,
      0,
      1
    );
  
    // Position vector
    let position = new THREE.Vector3(
      tvec.data64F[0],
      tvec.data64F[1],
      -tvec.data64F[2] // Invert z-axis
    );
  
    // Store marker data
    markerData[id] = {
      rotation: rotation,
      position: position,
    };
  
    // Update reference marker
    if (id === 3) {
      updateReferenceMarker();
    }
  
    // Clean up
    rotMatrix.delete();
  }
  
  // Update the reference marker and compute relative transformations
  function updateReferenceMarker() {
    let refMarker = markerData[3];
  
    if (!refMarker) return;
  
    let refInv = new THREE.Matrix4().getInverse(refMarker.rotation);
  
    for (let id of [0, 1, 2]) {
      if (markerData[id]) {
        let relRotation = new THREE.Matrix4().multiplyMatrices(
          refInv,
          markerData[id].rotation
        );
        let euler = new THREE.Euler().setFromRotationMatrix(
          relRotation,
          'XYZ'
        );
  
        // Update angles based on marker IDs
        if (id === 0) {
          smoothedAngles.r0y = applySmoothing(
            THREE.MathUtils.radToDeg(euler.y),
            smoothedAngles.r0y
          );
        } else if (id === 1) {
          smoothedAngles.r1y = applySmoothing(
            THREE.MathUtils.radToDeg(euler.y),
            smoothedAngles.r1y
          );
        } else if (id === 2) {
          smoothedAngles.r2x = applySmoothing(
            THREE.MathUtils.radToDeg(euler.x),
            smoothedAngles.r2x
          );
          smoothedAngles.r2y = applySmoothing(
            THREE.MathUtils.radToDeg(euler.y),
            smoothedAngles.r2y
          );
        }
      }
    }
  }
  
  // Smoothing function
  let USE_SMOOTHING = true;
  let alpha = 0.1; // Smoothing factor
  let smoothedAngles = {
    r0y: 0,
    r1y: 0,
    r2x: 0,
    r2y: 0,
  };
  
  function applySmoothing(newValue, oldValue) {
    if (USE_SMOOTHING) {
      return alpha * newValue + (1 - alpha) * oldValue;
    } else {
      return newValue;
    }
  }
  
  // Initialize Three.js scene
  function initThreeJS() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('three-container').appendChild(renderer.domElement);
  
    // Add controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
  
    // Set camera position
    camera.position.z = 5;
  
    // Add points P0, P1, P2
    let pointGeometry = new THREE.SphereGeometry(0.1, 32, 32);
    let pointMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  
    for (let i = 0; i < 3; i++) {
      let point = new THREE.Mesh(pointGeometry, pointMaterial);
      scene.add(point);
      points.push(point);
    }
  
    // Axes for each point
    for (let i = 0; i < 3; i++) {
      let axisHelper = new THREE.AxesHelper(1);
      scene.add(axisHelper);
      axes.push(axisHelper);
    }
  
    // Curves
    for (let i = 0; i < 2; i++) {
      let curveMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff });
      let curveGeometry = new THREE.BufferGeometry();
      let line = new THREE.Line(curveGeometry, curveMaterial);
      scene.add(line);
      curves.push(line);
    }
  }
  
  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
  
    // Update the scene based on the latest marker data
    updateScene();
  
    renderer.render(scene, camera);
  }
  
  // Update the 3D scene elements
  function updateScene() {
    // Define initial points
    let P0 = new THREE.Vector3(0.0, 10.0, 0.0);
    let P1 = new THREE.Vector3(0.0, 0.0, 0.0);
    let P2_initial = new THREE.Vector3(7.0, 0.0, 0.0);
  
    // Use smoothed angles
    let angles = {
      r0y: THREE.MathUtils.degToRad(smoothedAngles.r0y),
      r1y: THREE.MathUtils.degToRad(smoothedAngles.r1y),
      r2x: THREE.MathUtils.degToRad(smoothedAngles.r2x),
      r2y: THREE.MathUtils.degToRad(smoothedAngles.r2y),
    };
  
    // Apply rotations
    let rotations = [
      new THREE.Matrix4().makeRotationY(angles.r0y),
      new THREE.Matrix4().makeRotationY(angles.r1y),
      new THREE.Matrix4()
        .makeRotationX(angles.r2x)
        .multiply(new THREE.Matrix4().makeRotationY(angles.r2y)),
    ];
  
    // Update axes and points
    for (let i = 0; i < 3; i++) {
      let point = i === 0 ? P0 : i === 1 ? P1 : P2_initial.clone();
      let axis = axes[i];
      let mesh = points[i];
  
      if (i < 2) {
        point.applyMatrix4(rotations[i]);
      } else {
        point.applyMatrix4(rotations[2]);
      }
  
      mesh.position.copy(point);
      axis.position.copy(point);
  
      // Apply rotation to axes
      axis.setRotationFromMatrix(rotations[i]);
    }
  
    // Update curves
    // (Implement the Bezier curves and other calculations as per your original script)
    // For simplicity, here's an example of drawing a line between P0 and P1
    let curvePoints = new Float32Array([
      points[0].position.x,
      points[0].position.y,
      points[0].position.z,
      points[1].position.x,
      points[1].position.y,
      points[1].position.z,
    ]);
  
    curves[0].geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(curvePoints, 3)
    );
    curves[0].geometry.computeBoundingSphere();
  
    // Update other elements (circles, surfaces, etc.) as needed
  }
  
  // Handle window resize
  window.addEventListener(
    'resize',
    function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
  
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
    false
  );
  