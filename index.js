import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'; // Add this line
import GIF from 'gif.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const fileName = document.getElementById('file-name');
    const generateBtn = document.getElementById('generate-btn');
    const downloadLink = document.getElementById('download-link');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const gifPreview = document.getElementById('gif-preview');
    const gifResult = document.getElementById('gif-result');
    const errorMessage = document.getElementById('error-message');
    const frameCountInput = document.getElementById('frame-count');
    const imageSizeInput = document.getElementById('image-size');
    const backgroundColorInput = document.getElementById('background-color');
    const modelScaleInput = document.getElementById('model-scale');
    const scaleValue = document.getElementById('scale-value');

    // Three.js variables
    let scene, camera, renderer, controls, model;
    let isModelLoaded = false;
    let modelBoundingBox = new THREE.Box3();
    let modelCenter = new THREE.Vector3();
    let modelSize = new THREE.Vector3();

    // Initialize Three.js scene
    initScene();

    // Event listeners
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    dropArea.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFiles, false);
    generateBtn.addEventListener('click', generateGif);
    backgroundColorInput.addEventListener('change', () => {
        scene.background = new THREE.Color(backgroundColorInput.value);
    });
    modelScaleInput.addEventListener('input', () => {
        if (!model) return;

        const scale = parseFloat(modelScaleInput.value);
        scaleValue.textContent = scale.toFixed(1);

        // Apply the base scale multiplied by the user's scale factor
        const baseScale = model.userData.displayScale || 1;
        model.scale.set(baseScale * scale, baseScale * scale, baseScale * scale);
    });

    function initScene() {
        // Create scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(backgroundColorInput.value);

        // Create camera
        const container = document.getElementById('model-preview');
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(0, 0, 5);

        // Create renderer with better settings
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true,
            alpha: true
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        container.appendChild(renderer.domElement);

        // Add controls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.25;

        // Add enhanced lighting setup - this makes textures look much better
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        // Key light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        scene.add(directionalLight);

        // Fill light
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-5, 2, -7.5);
        scene.add(fillLight);

        // Add a ground plane for shadows
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -2;
        ground.receiveShadow = true;
        scene.add(ground);

        // Add a grid helper for reference
        const gridHelper = new THREE.GridHelper(10, 10);
        gridHelper.position.y = -2;
        scene.add(gridHelper);

        // Handle window resize
        window.addEventListener('resize', onWindowResize);

        // Start animation loop
        animate();
    }

    function onWindowResize() {
        const container = document.getElementById('model-preview');
        const width = container.clientWidth;
        const height = container.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        dropArea.classList.add('drag-over');
    }

    function unhighlight() {
        dropArea.classList.remove('drag-over');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles({ target: { files } });
    }

    function handleFiles(e) {
        const files = e.target.files;
        if (files && files.length) {
            const file = files[0];
            console.log("Processing file:", file.name);
            fileName.textContent = file.name;
            loadModel(file);
        } else {
            console.log("No files selected");
        }
    }

    function loadModel(file) {
        hideError();

        if (model) {
            scene.remove(model);
            model = null;
        }

        camera.position.set(0, 0, 5);
        controls.reset();

        const fileURL = URL.createObjectURL(file);
        const fileType = file.name.split('.').pop().toLowerCase();

        try {
            // Update your loadModel function with improved GLTF handling
            if (fileType === 'gltf' || fileType === 'glb') {
                // Create loading manager with better path handling
                const loadingManager = new THREE.LoadingManager();

                // Track the directory structure of the file
                const filePath = file.webkitRelativePath || '';
                const fileDirectory = filePath.split('/').slice(0, -1).join('/') + '/';

                // Store any resources that are part of this model loading
                const resources = [];

                loadingManager.setURLModifier((url) => {
                    console.log('Loading resource:', url);

                    // Handle data URLs and blobs directly
                    if (url.startsWith('blob:') || url.startsWith('data:')) {
                        return url;
                    }

                    // For GLTF loading, we need to handle relative paths
                    if (url.startsWith('./') || !url.startsWith('http')) {
                        // This is likely a relative path to a texture or binary file

                        // For files dropped alongside the GLTF
                        if (files && files.length > 1) {
                            // Look for the file in the dropped files
                            const fileName = url.split('/').pop();
                            for (let i = 0; i < files.length; i++) {
                                if (files[i].name === fileName) {
                                    const resourceURL = URL.createObjectURL(files[i]);
                                    resources.push(resourceURL); // Track to release later
                                    console.log(`Found resource ${fileName} in dropped files`);
                                    return resourceURL;
                                }
                            }
                        }

                        // For files loaded through file input, GLTF can't access the file system
                        // So we need to alert the user
                        console.warn(`External resource not found: ${url}`);
                        showResourceWarning(url);
                    }

                    return url;
                });

                // Add hooks for tracking loading progress and errors
                loadingManager.onProgress = function (url, loaded, total) {
                    console.log(`Loading: ${url} (${Math.round(loaded / total * 100)}%)`);
                };

                loadingManager.onError = function (url) {
                    console.error('Error loading resource:', url);
                    showResourceError(url);
                };

                // Then create the loader with the manager
                const loader = new GLTFLoader(loadingManager);

                // Add dracoLoader if you have complex meshes
                /*
                const dracoLoader = new DRACOLoader();
                dracoLoader.setDecoderPath('/draco/');
                loader.setDRACOLoader(dracoLoader);
                */

                // No need for setManager now, as we passed it to the constructor
                loader.load(fileURL, function (gltf) {
                    // Release the object URL since the model is now loaded
                    URL.revokeObjectURL(fileURL);

                    model = gltf.scene;

                    // Log materials and textures for debugging
                    console.log("Model loaded successfully");
                    model.traverse((node) => {
                        if (node.isMesh) {
                            console.log(`Mesh: ${node.name}`);
                            if (node.material) {
                                console.log(` - Material: ${node.material.name || 'Unnamed'}`);
                                if (node.material.map) {
                                    console.log(` - Has texture: Yes`);
                                } else {
                                    console.log(` - Has texture: No`);
                                }
                            }
                        }
                    });

                    setupModel(model);
                },
                    // Progress callback
                    function (xhr) {
                        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                    },
                    // Error callback 
                    function (error) {
                        console.error(error);
                        showError('Error loading GLTF/GLB model: ' + error.message);
                    });
            } else if (fileType === 'obj') {
                // Add texture loading for OBJ files with MTL support
                const mtlFile = findAssociatedMTL(files);
                if (mtlFile) {
                    const mtlLoader = new MTLLoader();
                    const mtlURL = URL.createObjectURL(mtlFile);
                    mtlLoader.load(mtlURL, function (materials) {
                        materials.preload();

                        const loader = new OBJLoader();
                        loader.setMaterials(materials);
                        loader.load(fileURL, function (obj) {
                            model = obj;
                            setupModel(model);
                        }, undefined, function (error) {
                            showError('Error loading OBJ model: ' + error.message);
                        });
                    });
                } else {
                    const loader = new OBJLoader();
                    loader.load(fileURL, function (obj) {
                        model = obj;
                        setupModel(model);
                    }, undefined, function (error) {
                        showError('Error loading OBJ model: ' + error.message);
                    });
                }
            } else {
                showError('Unsupported file format. Please use GLTF, GLB, or OBJ.');
            }
        } catch (error) {
            showError('Error loading model: ' + error.message);
        }
    }

    // Helper function to find associated MTL files
    function findAssociatedMTL(files) {
        if (!files || files.length <= 1) return null;

        // Look for MTL files in the file selection
        for (let i = 0; i < files.length; i++) {
            if (files[i].name.toLowerCase().endsWith('.mtl')) {
                return files[i];
            }
        }

        return null;
    }

    function setupModel(modelObj) {
        // Create a group to hold the model
        const modelGroup = new THREE.Group();
        modelGroup.add(modelObj);
        model = modelGroup;

        // Apply material settings (your existing code)
        // ...

        // IMPROVED: More accurate model centering
        modelBoundingBox.setFromObject(modelObj);
        modelCenter = new THREE.Vector3();
        modelBoundingBox.getCenter(modelCenter);
        modelSize = new THREE.Vector3();
        modelBoundingBox.getSize(modelSize);

        // Center the model within the group
        modelObj.position.sub(modelCenter);

        // IMPROVED: Better scaling logic
        const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
        if (maxDim > 0) {
            // More adaptive scale based on model complexity
            const targetSize = 4; // desired size in scene units
            const scale = targetSize / maxDim;
            modelGroup.scale.set(scale, scale, scale);

            // Store the scale for reference
            modelGroup.userData.displayScale = scale;
        }

        // Add model to scene
        scene.add(model);
        isModelLoaded = true;
        generateBtn.disabled = false;

        // IMPROVED: Better camera positioning for preview
        positionCameraForBestView(camera, controls);
    }

    // New helper function for optimal camera positioning
    function positionCameraForBestView(camera, controls) {
        // Get model dimensions for proper framing
        const size = new THREE.Vector3();
        modelBoundingBox.getSize(size);

        // Calculate camera position based on model size
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const cameraDistance = (maxDim / 2) / Math.tan(fov / 2);

        // Position at an angle for a good 3/4 view
        const cameraX = cameraDistance * 0.8;
        const cameraY = cameraDistance * 0.6;
        const cameraZ = cameraDistance * 0.9;

        camera.position.set(cameraX, cameraY, cameraZ);
        camera.lookAt(0, 0, 0);
        controls.update();
    }

    // Add this function after your positionCameraForBestView function

    function setupCameraForGif(camera, modelBbox) {
        // Get model dimensions
        const size = new THREE.Vector3();
        modelBbox.getSize(size);

        // Get the maximum dimension to ensure model fits in frame
        const maxDimension = Math.max(size.x, size.y, size.z);

        // Calculate proper camera Z distance based on field of view
        const fov = camera.fov * (Math.PI / 180); // Convert to radians
        const cameraDistance = (maxDimension / 2) / Math.tan(fov / 2);

        // Add padding (25%)
        const padding = 1.25;

        // Set camera to look straight at model from front
        camera.position.set(0, 0, cameraDistance * padding);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();

        return cameraDistance * padding;
    }

    // Helper function to ensure textures are loaded correctly
    function ensureTexturesLoaded(material) {
        // Make sure material parameters are properly set
        material.needsUpdate = true;

        // Handle texture maps
        const maps = [
            'map', 'normalMap', 'bumpMap', 'roughnessMap',
            'metalnessMap', 'emissiveMap', 'aoMap'
        ];

        maps.forEach(mapType => {
            if (material[mapType]) {
                material[mapType].needsUpdate = true;
                // Fix common texture issues
                material[mapType].flipY = false; // Often needed for GLTF
                material[mapType].encoding = THREE.sRGBEncoding;
            }
        });

        // Ensure proper material settings are applied
        if (material.map) {
            // If there's a texture, make sure settings are optimized
            material.transparent = material.transparent || material.map.hasTransparency;
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        console.error(message);
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }

    function generateGif() {
        if (!isModelLoaded) {
            showError('Please load a model first.');
            return;
        }

        // Get options
        const frameCount = parseInt(frameCountInput.value);
        const imageSize = parseInt(imageSizeInput.value);
        const backgroundColor = backgroundColorInput.value;

        // Update scene background color
        scene.background = new THREE.Color(backgroundColor);

        // Show progress
        progressContainer.style.display = 'block';
        downloadLink.style.display = 'none';
        gifPreview.style.display = 'none';
        generateBtn.disabled = true;

        // Create a temporary renderer with better settings
        const tempRenderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        tempRenderer.setSize(imageSize, imageSize);
        tempRenderer.setPixelRatio(1); // Force pixel ratio to 1 to avoid artifacts
        tempRenderer.setClearColor(backgroundColor, 1); // Ensure background is fully opaque
        tempRenderer.clear(); // Clear the renderer before first use

        // IMPROVED: Create a temporary scene for rendering the GIF frames
        // This prevents artifacts from the main scene
        const tempScene = new THREE.Scene();
        tempScene.background = new THREE.Color(backgroundColor);

        // Add lights to the temporary scene with better positioning
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Increase from 0.5 to 0.6
        tempScene.add(ambientLight);

        // Key light (main light from the front-right)
        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight1.position.set(1, 1, 2); // Position more in front
        tempScene.add(directionalLight1);

        // Fill light (softer light from left)
        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight2.position.set(-1.5, 0.5, 1); // Position more in front-left
        tempScene.add(directionalLight2);

        // Top light
        const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.3);
        directionalLight3.position.set(0, 2, 0); // From above
        tempScene.add(directionalLight3);

        // Create a temporary camera for GIF frames with wider FOV
        const tempCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000); // Increased from 20 to 40

        // IMPROVED: Create a proper clone that preserves the model hierarchy
        let modelClone;
        try {
            // Try to use SkeletonUtils if available
            modelClone = SkeletonUtils.clone(model);
        } catch (error) {
            console.warn("SkeletonUtils clone failed, using fallback clone method");
            // Fallback to basic cloning
            modelClone = model.clone();

            // Clone materials to avoid shared state issues
            modelClone.traverse((node) => {
                if (node.isMesh && node.material) {
                    if (Array.isArray(node.material)) {
                        node.material = node.material.map(mat => mat.clone());
                    } else {
                        node.material = node.material.clone();
                    }
                }
            });
        }

        tempScene.add(modelClone);

        // IMPORTANT: Center the model in world coordinates more precisely
        // Reset the modelClone position and rotation first
        modelClone.position.set(0, 0, 0);
        modelClone.rotation.set(0, 0, 0);

        // Now calculate the bounding box for proper centering
        const tempBbox = new THREE.Box3().setFromObject(modelClone);
        const tempCenter = new THREE.Vector3();
        tempBbox.getCenter(tempCenter);

        // Set model position to be exactly centered at world origin
        modelClone.position.set(-tempCenter.x, -tempCenter.y, -tempCenter.z);

        // Reset all rotations to start clean
        modelClone.rotation.set(0, 0, 0);

        // Force scene update to ensure transforms are applied
        tempScene.updateMatrixWorld(true);

        // Now set up the camera with our new function
        // This only needs to be done once, not per frame
        setupCameraForGif(tempCamera, new THREE.Box3().setFromObject(modelClone));

        // Better GIF settings to avoid artifacts
        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: imageSize,
            height: imageSize,
            workerScript: '/gif.worker.js', // Correctly points to the public directory
            debug: true,
            dither: false,
            transparent: null,
            repeat: 0,
            disposal: 2,
            background: backgroundColor
        });

        // Handle GIF generation progress with better logging
        gif.on('progress', function (p) {
            const percent = Math.round(p * 100);
            console.log(`GIF encoding progress: ${percent}%`);
            updateProgress(percent);
        });

        // Add error handler
        gif.on('abort', function (error) {
            console.error("GIF generation aborted:", error);
            showError('GIF generation failed: ' + (error || 'Unknown error'));
            progressContainer.style.display = 'none';
            generateBtn.disabled = false;
        });

        // Handle GIF generation completion
        gif.on('finished', function (blob) {
            console.log("GIF generation completed successfully!");

            // Hide progress
            progressContainer.style.display = 'none';

            // Show download button
            const url = URL.createObjectURL(blob);
            downloadLink.href = url;
            downloadLink.download = 'model.gif';
            downloadLink.style.display = 'inline-block';

            // Show preview
            gifResult.src = url;
            gifPreview.style.display = 'block';

            // Re-enable generate button
            generateBtn.disabled = false;
        });

        // Prepare frames array to hold all rendered images
        const frames = [];

        console.log(`Rendering ${frameCount} frames...`);

        // First, render all frames to reduce memory pressure during GIF encoding
        renderFrames(0, frameCount, frames, tempRenderer, tempCamera, tempScene, modelClone, gif);
    }

    // Add a buffer for the temporary renderer to ensure proper rendering
    function renderFrames(currentFrame, totalFrames, frames, tempRenderer, tempCamera, tempScene, modelClone, gif) {
        // Use a more precise approach for handling the completion
        if (currentFrame >= totalFrames) {
            console.log("All frames rendered. Creating seamless loop...");

            // CRITICAL FIX: Create a perfect loop by duplicating first frame at the end
            // This ensures no "jump" between last and first frame
            if (frames.length > 0) {
                console.log("Adding first frame to end for seamless loop");
                frames.push(frames[0]);
            }

            // Begin adding frames to the GIF
            console.log(`Adding ${frames.length} frames to GIF...`);
            addFramesToGif(0, frames, gif);
            return;
        }

        // Calculate exact angle for this frame
        // IMPORTANT: Use exact, consistent angles
        const angle = (currentFrame / totalFrames) * Math.PI * 2;

        // Set model rotation directly to this angle
        modelClone.rotation.set(0, angle, 0);

        // Recalculate bounding box after rotation
        const bbox = new THREE.Box3().setFromObject(modelClone);
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        // Ensure model stays perfectly centered
        modelClone.position.set(-center.x, -center.y, -center.z);

        // Force a complete redraw
        tempRenderer.clear();
        tempRenderer.render(tempScene, tempCamera);

        // Capture frame immediately 
        const imageData = tempRenderer.domElement.toDataURL('image/png');
        frames.push(imageData);

        // Update progress
        const percent = Math.round((currentFrame / totalFrames) * 50);
        updateProgress(percent);

        // Schedule next frame
        // IMPORTANT: Use requestAnimationFrame instead of setTimeout
        // This syncs better with browser rendering cycles
        requestAnimationFrame(function () {
            renderFrames(currentFrame + 1, totalFrames, frames, tempRenderer, tempCamera, tempScene, modelClone, gif);
        });
    }

    // Update your addFramesToGif function with these changes:
    function addFramesToGif(currentFrame, frames, gif) {
        if (currentFrame >= frames.length) {
            console.log("All frames added to GIF. Rendering final GIF...");

            try {
                // CRITICAL: Set proper loop settings
                gif.setOption('repeat', 0);  // 0 means loop forever
                gif.render();
            } catch (error) {
                console.error("Error during GIF rendering:", error);
                showError('Error during GIF rendering: ' + error.message);
                progressContainer.style.display = 'none';
                generateBtn.disabled = false;
            }
            return;
        }

        // Create an image from the frame data
        const img = new Image();
        img.onload = function () {
            try {
                // CHANGE THIS VALUE TO SLOW DOWN ROTATION:
                // 40ms = 25fps (fast)
                // 80ms = 12.5fps (medium)
                // 120ms = 8.3fps (slow)
                const fixedDelay = 80;  // Changed from 40 to 80 for slower rotation

                // Add the frame to the GIF
                gif.addFrame(img, {
                    delay: fixedDelay,
                    dispose: 2  // This is important for clean transitions
                });

                // Process next frame synchronously to maintain ordering
                addFramesToGif(currentFrame + 1, frames, gif);
            } catch (error) {
                console.error("Error adding frame to GIF:", error);
                showError('Error adding frame to GIF: ' + error.message);
                progressContainer.style.display = 'none';
                generateBtn.disabled = false;
            }
        };

        img.src = frames[currentFrame];
    }

    function updateProgress(percent) {
        progressBar.style.width = percent + '%';
        progressText.textContent = percent + '%';
    }

    // Add this to your DOMContentLoaded event handler
    // modelScaleInput is already declared above, no need to redeclare it
    // const modelScaleInput = document.getElementById('model-scale');
    // const scaleValue = document.getElementById('scale-value'); // scaleValue is also already declared

    modelScaleInput.addEventListener('input', () => {
        if (!model) return;

        const scale = parseFloat(modelScaleInput.value);
        scaleValue.textContent = scale.toFixed(1);

        // Apply the base scale multiplied by the user's scale factor
        const baseScale = model.userData.displayScale || 1;
        model.scale.set(baseScale * scale, baseScale * scale, baseScale * scale);
    });

    // Add these functions to show warnings about missing resources
    function showResourceWarning(url) {
        // Show a less intrusive warning for resources
        console.warn(`Could not load external resource: ${url}`);

        // Create or update a warning element
        let warningEl = document.getElementById('resource-warning');
        if (!warningEl) {
            warningEl = document.createElement('div');
            warningEl.id = 'resource-warning';
            warningEl.style.position = 'absolute';
            warningEl.style.top = '10px';
            warningEl.style.left = '10px';
            warningEl.style.backgroundColor = 'rgba(255, 200, 0, 0.8)';
            warningEl.style.color = 'black';
            warningEl.style.padding = '10px';
            warningEl.style.borderRadius = '5px';
            warningEl.style.maxWidth = '80%';
            warningEl.style.zIndex = '1000';
            document.body.appendChild(warningEl);
        }

        warningEl.innerHTML = `<b>Warning:</b> Some model resources could not be loaded.<br>
            The model might display without textures.<br>
            For GLTF files, please use GLB format instead or upload all related files together.<br>
            <small>(Missing: ${url.split('/').pop()})</small>`;

        // Hide after 8 seconds
        setTimeout(() => {
            warningEl.style.display = 'none';
        }, 8000);
    }

    function showResourceError(url) {
        // Only show error for critical resources
        const fileExt = url.split('.').pop().toLowerCase();
        const criticalExts = ['bin', 'gltf', 'glb'];

        if (criticalExts.includes(fileExt)) {
            showError(`Failed to load critical resource: ${url.split('/').pop()}`);
        } else {
            showResourceWarning(url);
        }
    }

    // Add this function for blended frames:
    function createBlendedFrame(frame1Url, frame2Url, blendRatio, width, height) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            const img1 = new Image();
            img1.onload = () => {
                ctx.drawImage(img1, 0, 0);

                const img2 = new Image();
                img2.onload = () => {
                    ctx.globalAlpha = blendRatio;
                    ctx.drawImage(img2, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                };
                img2.src = frame2Url;
            };
            img1.src = frame1Url;
        });
    }

    // Add this to your renderFrames function to generate interpolated frames:
    async function generateInterpolatedFrames(frames, totalFrames, imageSize) {
        const blendedFrames = [];
        const interpolationFactor = 1; // Increase for more interpolated frames

        for (let i = 0; i < frames.length; i++) {
            // Add the original frame
            blendedFrames.push(frames[i]);

            // Add interpolated frames between this one and the next
            if (i < frames.length - 1) {
                for (let j = 1; j <= interpolationFactor; j++) {
                    const ratio = j / (interpolationFactor + 1);
                    const blendedFrame = await createBlendedFrame(
                        frames[i],
                        frames[(i + 1) % frames.length],
                        ratio,
                        imageSize,
                        imageSize
                    );
                    blendedFrames.push(blendedFrame);
                }
            }
        }

        return blendedFrames;
    }
});