const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('model', {
    alias: 'm',
    description: 'Path to 3D model file',
    type: 'string',
    demandOption: true
  })
  .option('output', {
    alias: 'o',
    description: 'Path for output GIF',
    type: 'string',
    demandOption: true
  })
  .option('frames', {
    alias: 'f',
    description: 'Number of frames',
    type: 'number',
    default: 36
  })
  .option('size', {
    alias: 's',
    description: 'Image size',
    type: 'number',
    default: 400
  })
  .option('bg', {
    alias: 'b',
    description: 'Background color',
    type: 'string',
    default: '#ffffff'
  })
  .help()
  .argv;

async function renderModelToGif() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Get absolute paths
    const modelPath = path.resolve(argv.model);
    const outputPath = path.resolve(argv.output);
    
    // Load Three.js and other libraries
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js' });
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/js/controls/OrbitControls.min.js' });
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/js/loaders/GLTFLoader.min.js' });
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/js/loaders/OBJLoader.min.js' });
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js' });
    
    // Create HTML content with a container for Three.js
    await page.setContent(`
      <div id="container" style="width: ${argv.size}px; height: ${argv.size}px;"></div>
      <div id="progress-container">
        <div id="progress-bar" style="width: 0%; height: 10px; background-color: blue;"></div>
        <div id="progress-text">0%</div>
      </div>
    `);
    
    // Run the Three.js code to generate the GIF
    const result = await page.evaluate(async (modelPath, options) => {
      return new Promise((resolve, reject) => {
        try {
          // Set up Three.js scene
          const container = document.getElementById('container');
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(options.backgroundColor);
          
          // Set up camera
          const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 1000);
          
          // Set up renderer
          const renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            preserveDrawingBuffer: true
          });
          renderer.setSize(options.imageSize, options.imageSize);
          renderer.setPixelRatio(1);
          container.appendChild(renderer.domElement);
          
          // Add lights
          const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
          scene.add(ambientLight);
          
          const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
          directionalLight.position.set(1, 1, 1);
          scene.add(directionalLight);
          
          // Set up GIF encoder
          const gif = new GIF({
            workers: 2,
            quality: 8,
            width: options.imageSize,
            height: options.imageSize,
            workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js',
            dither: false
          });
          
          // Update progress function
          function updateProgress(percent) {
            document.getElementById('progress-bar').style.width = percent + '%';
            document.getElementById('progress-text').textContent = percent + '%';
          }
          
          // Load the model
          const fileExt = modelPath.split('.').pop().toLowerCase();
          let loader;
          
          if (fileExt === 'glb' || fileExt === 'gltf') {
            loader = new THREE.GLTFLoader();
          } else if (fileExt === 'obj') {
            loader = new THREE.OBJLoader();
          } else {
            return reject('Unsupported file format: ' + fileExt);
          }
          
          // Create a fetch request to load the model from file path
          fetch(modelPath)
            .then(response => response.arrayBuffer())
            .then(buffer => {
              return new Promise((resolve, reject) => {
                loader.parse(buffer, '', resolve, reject);
              });
            })
            .then(loadedObject => {
              let model;
              
              // Handle different model types
              if (fileExt === 'glb' || fileExt === 'gltf') {
                model = loadedObject.scene;
              } else {
                model = loadedObject;
              }
              
              // Create a group to hold the model
              const modelGroup = new THREE.Group();
              modelGroup.add(model);
              
              // Center and scale the model
              const bbox = new THREE.Box3().setFromObject(model);
              const center = bbox.getCenter(new THREE.Vector3());
              const size = bbox.getSize(new THREE.Vector3());
              
              // Center the model
              model.position.sub(center);
              
              // Scale the model
              const maxDim = Math.max(size.x, size.y, size.z);
              if (maxDim > 0) {
                const scale = 4 / maxDim;
                modelGroup.scale.set(scale, scale, scale);
              }
              
              // Add to scene
              scene.add(modelGroup);
              
              // Position camera
              const distance = maxDim * 1.5;
              camera.position.set(0, 0, distance);
              camera.lookAt(0, 0, 0);
              
              // Create frame rendering function
              const frames = [];
              const angleIncrement = (2 * Math.PI) / options.frameCount;
              
              // Render frames
              function renderFrames(currentFrame) {
                if (currentFrame >= options.frameCount) {
                  addFramesToGif(0);
                  return;
                }
                
                // Set rotation
                modelGroup.rotation.y = currentFrame * angleIncrement;
                
                // Render the frame
                renderer.render(scene, camera);
                
                // Capture the frame
                const imageData = renderer.domElement.toDataURL('image/png');
                frames.push(imageData);
                
                // Update progress
                updateProgress(Math.round((currentFrame / options.frameCount) * 50));
                
                // Next frame
                setTimeout(() => renderFrames(currentFrame + 1), 0);
              }
              
              // Add frames to GIF
              function addFramesToGif(currentFrame) {
                if (currentFrame >= frames.length) {
                  // All frames added, render the GIF
                  gif.on('finished', function(blob) {
                    // Convert blob to base64
                    const reader = new FileReader();
                    reader.readAsDataURL(blob);
                    reader.onloadend = function() {
                      const base64data = reader.result.split(',')[1];
                      resolve(base64data);
                    };
                  });
                  
                  gif.on('progress', function(p) {
                    updateProgress(50 + Math.round(p * 50));
                  });
                  
                  gif.render();
                  return;
                }
                
                const img = new Image();
                img.onload = function() {
                  gif.addFrame(img, { delay: 100 });
                  setTimeout(() => addFramesToGif(currentFrame + 1), 0);
                };
                img.src = frames[currentFrame];
              }
              
              // Start rendering frames
              renderFrames(0);
            })
            .catch(error => {
              reject('Error loading model: ' + error);
            });
        } catch (error) {
          reject('Error in Three.js code: ' + error.message);
        }
      });
    }, modelPath, {
      frameCount: argv.frames,
      imageSize: argv.size,
      backgroundColor: argv.bg
    });
    
    // Save the base64 data as a GIF file
    const gifData = Buffer.from(result, 'base64');
    fs.writeFileSync(outputPath, gifData);
    
    console.log('GIF successfully generated: ' + outputPath);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

renderModelToGif();