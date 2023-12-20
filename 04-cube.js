////////////////////////////////////////////////////////////////////////////////
// START OF BOILERPLATE CODE ///////////////////////////////////////////////////

// Get the WebGL context
const canvas = document.getElementById('canvas')
const gl = canvas.getContext('webgl2')

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

// Pallet

const palletShader = glance.buildShaderProgram(gl, "pallet-shader", cubeVertexShader, cubeFragmentShader, {
    u_ambientIntensity: 1,
    u_ambientColor: [1, 1, 1],
    u_lightPos: [1, 10, 5],
    u_lightColor: [1, 1, 1],
    u_projectionMatrix: projectionMatrix,
    u_texDiffuse: 0,
})

const {attributes: palletAttributes, indices: palletIndices} = await glance.loadObj("./obj/pallet.obj")

const palletIBO = glance.createIndexBuffer(gl, palletIndices)

const palletABO = glance.createAttributeBuffer(
    gl,
    "pallet-abo",
    palletAttributes,
    { 
    a_pos: { size: 3, type: gl.FLOAT },
    a_texCoord: { size: 2, type: gl.FLOAT },
    a_normal: { size: 3, type: gl.FLOAT },
    }
)

const palletVAO = glance.createVAO(
    gl,
    "pallet-vao",
    palletIBO,
    glance.buildAttributeMap(palletShader, palletABO, ["a_pos", "a_normal", "a_texCoord"]
))

const palletTextureDiffuse = glance.loadTexture(gl, 1024, 1024, "img/pallet.jpg")

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
    -0.1, -0.1, 0.1,
    0.1, -0.1, 0.1,
    0.1, 0.1, 0.1,
    -0.1, 0.1, 0.1,

    // Back face
    -0.1, -0.1, -0.1,
    -0.1, 0.1, -0.1,
    0.1, 0.1, -0.1,
    0.1, -0.1, -0.1,

    // Top face
    -0.1, 0.1, -0.1,
    -0.1, 0.1, 0.1,
    0.1, 0.1, 0.1,
    0.1, 0.1, -0.1,

    // Bottom face
    -0.1, -0.1, -0.1,
    0.1, -0.1, -0.1,
    0.1, -0.1, 0.1,
    -0.1, -0.1, 0.1,

    // Right face
    0.1, -0.1, -0.1,
    0.1, 0.1, -0.1,
    0.1, 0.1, 0.1,
    0.1, -0.1, 0.1,

    // Left face
    -0.1, -0.1, -0.1,
    -0.1, -0.1, 0.1,
    -0.1, 0.1, 0.1,
    -0.1, 0.1, -0.1,
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
    glance.buildAttributeMap(cubeShader, cubeABO, ["a_pos", "a_normal", "a_texCoord"]))

const cubeTextureDiffuse = glance.loadTexture(gl, 1024, 1024, "img/randomBrick.jpg")

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

const [skyCubemap, skyCubeMapLoaded] = glance.loadCubemap(gl, "sky-texture", 1024, 1024, [
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
let viewTilt = 0
let cubePosition = [0, 1, 0]

// Variables for movement
let startTime = 0;
let relativeTime = 0;
let transformStartPos = [0, 1, 0];
let transformEndPos = [0, 0.2, 0];
let transformPos = [0, 0, 0]

function restartMovement() {
    startTime = performance.now();
    transformPos[0] = transformStartPos[0];
    transformPos[1] = transformStartPos[1];
    transformPos[2] = transformStartPos[2];
    relativeTime = 0;
}


const palletDrawCall = glance.createDrawCall(gl, palletShader, palletVAO,
    {
        u_modelMatrix: () => mat4.translate(mat4.identity(), [0, -0.8, 0]),
        u_viewMatrix: () => mat4.invert(mat4.multiply(mat4.multiply(
            mat4.multiply(mat4.identity(), mat4.fromRotation(viewPan, [0, 1, 0])),
            mat4.fromRotation(viewTilt, [1, 0, 0])
        ), mat4.fromTranslation([0, 0, viewDist]))),
    },
    [
        [0, palletTextureDiffuse],
    ]
)

const cubeDrawCall = glance.createDrawCall(gl,
    cubeShader,
    cubeVAO,
    {
        // uniform update callbacks
        u_modelMatrix: () => mat4.translate(mat4.identity(), [0, 0, 0]),
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
const cubeDrawCall2 = glance.createDrawCall(gl, cubeShader, cubeVAO,
    {   
        u_modelMatrix: () => {
            let modelMatrix = mat4.identity();

            let direction = [transformEndPos[0] - transformStartPos[0], transformEndPos[1] - transformStartPos[1], transformEndPos[2] - transformStartPos[2]];
            let speed = 0.00001; 

            for (let i = 0; i < 3; i++) { //beschleunigte Bewegung hier
                transformPos[i] = transformStartPos[i] + direction[i] * speed * relativeTime * relativeTime;
        
                if ((direction[i] > 0 && transformPos[i] > transformEndPos[i]) ||
                    (direction[i] < 0 && transformPos[i] < transformEndPos[i])) {
                    transformPos[i] = transformEndPos[i];
                }
            }
            modelMatrix = mat4.translate(modelMatrix, [transformPos[0], transformPos[1], transformPos[2]]);
            return modelMatrix;
        },
        u_viewMatrix: () => mat4.invert(mat4.multiply(mat4.multiply(
            mat4.multiply(mat4.identity(), mat4.fromRotation(viewPan, [0, 1, 0])),
            mat4.fromRotation(viewTilt, [1, 0, 0])
        ), mat4.fromTranslation([0, 0, viewDist]))),
    },
    [
        [0, cubeTextureDiffuse],
    ]
) 

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
    relativeTime = time - startTime;
    // One-time WebGL setup
    // gl.enable(gl.CULL_FACE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

    // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    // glance.performDrawCall(gl, palletDrawCall, time)
    // glance.performDrawCall(gl, cubeDrawCall, time)
    // glance.performDrawCall(gl, cubeDrawCall2, cubePosition)
    glance.performDrawCall(gl, skyDrawCall, time)
    // console.log(gl.getError());
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
        //  cubePosition = [0, -0.8, 0]
        restartMovement(); 
        console.log(cubePosition);
    }
})