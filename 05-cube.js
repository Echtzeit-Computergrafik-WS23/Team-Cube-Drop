////////////////////////////////////////////////////////////////////////////////
// START OF BOILERPLATE CODE ///////////////////////////////////////////////////

// Get the WebGL context
const canvas = document.getElementById('canvas')
const gl = canvas.getContext('webgl2')

const playerCount = document.getElementById('playerCount');
let count = 0;

// Add mouse move event handlers to the canvas to update the cursor[] array.
const cursor = [0, 0]
canvas.addEventListener('mousemove', (event) =>
{
    cursor[0] = (event.offsetX / canvas.width) * 2 - 1
    cursor[1] = (event.offsetY / canvas.height) * -2 + 1
})

function onMouseDrag(callback)
{
    canvas.addEventListener('pointerdown', () =>
    {
        const stopDrag = () =>
        {
            canvas.removeEventListener("pointermove", callback)
            canvas.removeEventListener("pointerup", stopDrag)
            canvas.removeEventListener("pointerleave", stopDrag)
        }

        canvas.addEventListener('pointermove', callback)
        canvas.addEventListener("pointerup", stopDrag, { once: true })
        canvas.addEventListener("pointerleave", stopDrag, { once: true })
    })
}

function onMouseWheel(callback)
{
    canvas.addEventListener('wheel', callback)
}

function onKeyDown(callback)
{
    window.addEventListener('keydown', callback)
}

// Basic render loop manager.
function setRenderLoop(callback)
{
    function renderLoop(time)
    {
        if (setRenderLoop._callback !== null) {
            setRenderLoop._callback(time)
            requestAnimationFrame(renderLoop)
        }
    }
    setRenderLoop._callback = callback
    requestAnimationFrame(renderLoop)
}
setRenderLoop._callback = null

function animateProperty(object, property, startValue, endValue, duration, callback) {
    let startTime = null;

    function animate(timestamp) {
        if (startTime === null) startTime = timestamp;
        let elapsed = timestamp - startTime;

        if (elapsed < duration) {
            let progress = elapsed / duration; // calculate progress
            let currentValue = startValue + progress * (endValue - startValue); // calculate current value
            object[property] = currentValue; // update value

            requestAnimationFrame(animate); // request next frame
        } else {
            object[property] = endValue; // ensure end value is set correctly after animation
            if (callback) callback();
        }
    }

    requestAnimationFrame(animate);
}

import glance from './js/glance.js'

// BOILERPLATE END
////////////////////////////////////////////////////////////////////////////////

const {
    vec3,
    mat3,
    mat4,
} = glance


const cubeVertexShader = `#version 300 es
    precision highp float;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform mat3 u_normalMatrix;

    in vec3 a_pos;
    in vec3 a_normal;
    in vec2 a_texCoord;

    out vec3 f_cubePos;
    out vec3 f_normal;
    out vec2 f_texCoord;

    void main() {
        f_cubePos = vec3(u_modelMatrix * vec4(a_pos, 1.0));
        f_normal = u_normalMatrix * a_normal;
        f_texCoord = a_texCoord;
        gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_pos, 1.0);
    }
`

const cubeFragmentShader = `#version 300 es
    precision mediump float;

    uniform vec3 u_ambientColor;
    uniform float u_ambientIntensity;
    uniform vec3 u_lightPos;
    uniform vec3 u_lightColor;
    uniform sampler2D u_texDiffuse;

    in vec3 f_cubePos;
    in vec3 f_normal;
    in vec2 f_texCoord;

    out vec4 FragColor;

    void main() {

        // texture
        vec3 texDiffuse = texture(u_texDiffuse, f_texCoord).rgb;

        // diffuse
        vec3 normal = normalize(f_normal);
        vec3 lightDir = normalize(u_lightPos - f_cubePos);
        float diffuseIntensity = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = diffuseIntensity * u_lightColor * texDiffuse;

        // ambient
        vec3 ambient = u_ambientColor * u_ambientIntensity * texDiffuse;

        // color
        FragColor = vec4(ambient + diffuse, 1.0);
}
`

const skyVertexShader = `#version 300 es
    precision highp float;

    uniform mat3 u_viewRotationMatrix;
    uniform mat4 u_projectionMatrix;

    in vec3 a_pos;

    out vec3 f_texCoord;

    void main() {
        // Use the local position of the vertex as texture coordinate.
        f_texCoord = a_pos;

        // By setting Z == W, we ensure that the vertex is projected onto the
        // far plane, which is exactly what we want for the background.
        vec4 ndcPos = u_projectionMatrix * inverse(mat4(u_viewRotationMatrix)) * vec4(a_pos, 1.0);
        gl_Position = ndcPos.xyww;
    }
`


const skyFragmentShader = `#version 300 es
    precision mediump float;

    uniform samplerCube u_skybox;

    in vec3 f_texCoord;

    out vec4 FragColor;

    void main() {
        // The fragment color is simply the color of the skybox at the given
        // texture coordinate (local coordinate) of the fragment on the cube.
        FragColor = texture(u_skybox, f_texCoord);
    }
`

// =============================================================================
// Data
// =============================================================================

const projectionMatrix = mat4.perspective(Math.PI / 4, 1, 0.1, 14)


// Cubes
const cubeShader = glance.buildShaderProgram(gl, "cube-shader", cubeVertexShader, cubeFragmentShader, {
    u_ambientIntensity: 0.1,
    u_ambientColor: [1, 1, 1],
    u_lightPos: [1, 10, 5],
    u_lightColor: [1, 1, 1],
    u_projectionMatrix: projectionMatrix,
    u_texDiffuse: 0,
})

const positions = [
    // Vertices
    // Front face
    -0.2, -0.2, 0.2,
    0.2, -0.2, 0.2,
    0.2, 0.2, 0.2,
    -0.2, 0.2, 0.2,

    // Back face
    -0.2, -0.2, -0.2,
    -0.2, 0.2, -0.2,
    0.2, 0.2, -0.2,
    0.2, -0.2, -0.2,

    // Top face
    -0.2, 0.2, -0.2,
    -0.2, 0.2, 0.2,
    0.2, 0.2, 0.2,
    0.2, 0.2, -0.2,

    // Bottom face
    -0.2, -0.2, -0.2,
    0.2, -0.2, -0.2,
    0.2, -0.2, 0.2,
    -0.2, -0.2, 0.2,

    // Right face
    0.2, -0.2, -0.2,
    0.2, 0.2, -0.2,
    0.2, 0.2, 0.2,
    0.2, -0.2, 0.2,

    // Left face
    -0.2, -0.2, -0.2,
    -0.2, -0.2, 0.2,
    -0.2, 0.2, 0.2,
    -0.2, 0.2, -0.2,
];

const textureCoordinates = [
    // Texture Coordinates
    // Front face
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,

    // Back face
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,
    0.0, 0.0,

    // Top face
    0.0, 1.0,
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,

    // Bottom face
    1.0, 1.0,
    0.0, 1.0,
    0.0, 0.0,
    1.0, 0.0,

    // Right face
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,
    0.0, 0.0,

    // Left face
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,
];

const normals = [
    // Front face
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,

    // Back face
    0.0, 0.0, -1.0,
    0.0, 0.0, -1.0,
    0.0, 0.0, -1.0,
    0.0, 0.0, -1.0,

    // Top face
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 1.0, 0.0,

    // Bottom face
    0.0, -1.0, 0.0,
    0.0, -1.0, 0.0,
    0.0, -1.0, 0.0,
    0.0, -1.0, 0.0,

    // Right face
    1.0, 0.0, 0.0,
    1.0, 0.0, 0.0,
    1.0, 0.0, 0.0,
    1.0, 0.0, 0.0,

    // Left face
    -1.0, 0.0, 0.0,
    -1.0, 0.0, 0.0,
    -1.0, 0.0, 0.0,
    -1.0, 0.0, 0.0,
];

// Combine positions, texture coordinates, and normals for each vertex
const cubeAttributes = [];
for (let i = 0; i < positions.length / 3; i++) {
    cubeAttributes.push(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
        textureCoordinates[i * 2],
        textureCoordinates[i * 2 + 1],
        normals[i * 3],
        normals[i * 3 + 1],
        normals[i * 3 + 2]
    );
}

const indices = [
    0,
    1,
    2,
    0,
    2,
    3, // front
    4,
    5,
    6,
    4,
    6,
    7, // back
    8,
    9,
    10,
    8,
    10,
    11, // top
    12,
    13,
    14,
    12,
    14,
    15, // bottom
    16,
    17,
    18,
    16,
    18,
    19, // right
    20,
    21,
    22,
    20,
    22,
    23, // left
];

const cubeIBO = glance.createIndexBuffer(gl, indices)

const cubeABO = glance.createAttributeBuffer(
    gl,
    "cube-abo",
    cubeAttributes,
    { 
    a_pos: { size: 3, type: gl.FLOAT },
    a_texCoord: { size: 2, type: gl.FLOAT },
    a_normal: { size: 3, type: gl.FLOAT },
    }
)

const cubeVAO = glance.createVAO(
    gl,
    "cube-vao",
    cubeIBO,
    glance.buildAttributeMap(cubeShader, cubeABO, ["a_pos", "a_normal", "a_texCoord"]
))

const cubeTextureDiffuse = await glance.loadTextureNow(gl, "./img/randomBrick.jpg", {
    wrap: gl.REPEAT,
});

// The skybox
const skyShader = glance.buildShaderProgram(gl, "sky-shader", skyVertexShader, skyFragmentShader, {
    u_projectionMatrix: projectionMatrix,
    u_skybox: 0,
})

const skyIBO = glance.createIndexBuffer(gl, glance.createSkyBoxIndices())

const skyABO = glance.createAttributeBuffer(gl, "sky-abo", glance.createSkyBoxAttributes(), {
    a_pos: { size: 3, type: gl.FLOAT },
})

const skyVAO = glance.createVAO(gl, "sky-vao", skyIBO, glance.buildAttributeMap(skyShader, skyABO, ["a_pos"]))

const [skyCubemap, skyCubeMapLoaded] = glance.loadCubemap(gl, "sky-texture", 1024, 1024,[
    "img/skyBox/FishPond/negx.jpg",//left
    "img/skyBox/FishPond/posx.jpg",//right
    "img/skyBox/FishPond/posy.jpg",//top
    "img/skyBox/FishPond/negy.jpg",//bottom
    "img/skyBox/FishPond/posz.jpg",//back
    "img/skyBox/FishPond/negz.jpg",//front
    
])

// =============================================================================
// Draw Calls
// =============================================================================


let viewDist = 4.5
let viewPan = 0
let viewTilt = -0.1

let tower = [
    {
        position: [0, -1.4, 0],
    },
    {
        position: [0, -1, 0],
    },
    {
        position: [0, 1.5 , 0],
    },
]

for (let i = 0; i < tower.length; i++) {
    let cube = tower[i]
    const cubeDrawCall = glance.createDrawCall(
        gl,
        cubeShader,
        cubeVAO,
        {
            // uniform update callbacks
            u_modelMatrix: () => mat4.translate(mat4.identity(), cube.position),
            u_viewMatrix: () => mat4.invert(mat4.multiply(mat4.multiply(
                mat4.multiply(mat4.identity(), mat4.fromRotation(viewPan, [0, 1, 0])),
                mat4.fromRotation(viewTilt, [1, 0, 0])
            ), mat4.fromTranslation([0, 0, viewDist]))),    
        },
        [
            // texture bindings
            [0, cubeTextureDiffuse],
        ]
    )
    cube.drawCall = cubeDrawCall
}

const skyDrawCall = glance.createDrawCall(
    gl,
    skyShader,
    skyVAO,
    {
        // uniform update callbacks
        u_viewRotationMatrix: () => mat3.fromMat4(mat4.multiply(
            mat4.multiply(mat4.identity(), mat4.fromRotation(viewPan, [0, 1, 0])),
            mat4.fromRotation(viewTilt, [1, 0, 0])
        )),
    },
    [
        // texture bindings
        [0, skyCubemap],
    ],
    () => skyCubeMapLoaded.isComplete()
)
  

 
// =============================================================================
// System Integration
// =============================================================================

setRenderLoop((time) =>
{
    // One-time WebGL setup
    // gl.enable(gl.CULL_FACE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


    for (let i = 0; i < tower.length; i++) {
        let cube = tower[i]
        glance.performDrawCall(gl, cube.drawCall, time)
    }

    glance.performDrawCall(gl, skyDrawCall, time)
})

onMouseDrag((e) =>
{
    viewPan += e.movementX * -.01
    viewTilt += e.movementY * -.01
})

onMouseWheel((e) =>
{
    viewDist = Math.max(1.5, Math.min(10, viewDist * (1 + Math.sign(e.deltaY) * 0.2)))
})


onKeyDown((e) => {
    if (e.key == " ") {
        let startValue = tower[tower.length - 1].position[1];
        let endValue = tower[tower.length - 2].position[1] + 0.4;
        let duration = 1000; // duration in milliseconds
        animateProperty(
            tower[tower.length - 1].position,
            1,
            startValue,
            endValue,
            duration,
            () => {
                startValue = endValue
            }
        )

            let moveSpeed = 0.001 ; // speed of the movement
            let moveRange = 1; // range of the movement
            setTimeout(() => {
                const newCube = {
                    position: [0, 1.5, 0],
                    drawCall: null,
            }
            tower.push(newCube)
            newCube.drawCall = glance.createDrawCall(
                gl,
                cubeShader,
                cubeVAO,
                {
                    // uniform update callbacks
                    u_modelMatrix: (time) => {
                        if (newCube.position[1] == 1.5) {
                            newCube.position[0] = moveRange * Math.sin(time * moveSpeed * count);
                        }
                        return mat4.translate(mat4.identity(), newCube.position);
                    },
                    u_viewMatrix: () => mat4.invert(mat4.multiply(mat4.multiply(
                        mat4.multiply(mat4.identity(), mat4.fromRotation(viewPan, [0, 1, 0])),
                        mat4.fromRotation(viewTilt, [1, 0, 0])
                    ), mat4.fromTranslation([0, 0, viewDist]))),    
                },
                [
                    // texture bindings
                    [0, cubeTextureDiffuse],
                ]
            )
            
            function calculateDistance(point1, point2) {
                const dx = point1[0] - point2[0];
                const dy = point1[1] - point2[1];
                const dz = point1[2] - point2[2];
                return [dx, dy, dz];
            }


            setTimeout(() => {
                let previousCubeEndPosition = [0, 0, 0];
                for (let i = 0; i < tower.length; i++) {
                    let cube = tower[i]
                    if (tower.length - 1 === i) break;
                    let startValue = cube.position[1];
                    const endValue = cube.position[1] - 0.1 ;
                    animateProperty(
                        cube.position,
                        1,
                        startValue,
                        endValue -.3 , 
                        100,
                        () => {
                            startValue = endValue
                        }
                    )
                    if (i > 0) {
                        previousCubeEndPosition = [...tower[i - 1].position];
                    }
                
                    if (i > 0) {
                        const distance = calculateDistance(previousCubeEndPosition, cube.position);
                
                        if (distance[0] > 0.4 || distance[0] < -0.4) {
                            location.reload();
                        }
                    }
                }
                count += 1;
                playerCount.innerHTML = count;
                tower.shift();
            }, 500)


        }, 1000)

    }
}) 