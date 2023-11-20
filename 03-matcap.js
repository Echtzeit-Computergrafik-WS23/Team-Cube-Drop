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

canvas.addEventListener('pointerup', onMouseUp);

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


// =============================================================================
// Shader Code
// =============================================================================


const worldVertexShader = `#version 300 es
    precision highp float;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform mat3 u_normalMatrix;

    in vec3 a_pos;
    in vec3 a_normal;

    out vec3 f_worldPos;
    out vec3 f_normal;
    out vec2 f_sampleCoord;

    void main()
    {
        f_worldPos = vec3(u_modelMatrix * vec4(a_pos, 1.0));
        f_normal = u_normalMatrix * a_normal;
        gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_pos, 1.0);

        // code from https://www.clicktorelease.com/blog/creating-spherical-environment-mapping-shader/
        vec3 eye = normalize((u_viewMatrix * u_modelMatrix * vec4(a_pos, 1.0)).xyz);
        vec3 normal = normalize(f_normal);
        vec3 ray = reflect(eye, normal);
        float m = 2. * sqrt(
            pow(ray.x, 2.) +
            pow(ray.y, 2.) +
            pow(ray.z + 1., 2.)
        );
        f_sampleCoord = ray.xy / m + .5;
    }
`


const worldFragmentShader = `#version 300 es
    precision mediump float;

    uniform float u_ambient;
    uniform float u_specular;
    uniform float u_shininess;
    uniform vec3 u_lightPos;
    uniform vec3 u_lightColor;
    uniform vec3 u_viewPos;
    uniform sampler2D u_matcap;

    in vec3 f_worldPos;
    in vec3 f_normal;
    in vec2 f_sampleCoord;

    out vec4 FragColor;

    void main()
    {
        // texture
        vec3 texDiffuse = texture(u_matcap, f_sampleCoord).rgb;

        // ambient
        vec3 ambient = vec3(u_ambient) * texDiffuse;

        // diffuse
        vec3 normal = normalize(f_normal);
        vec3 lightDir = normalize(u_lightPos - f_worldPos);
        float diffuseIntensity = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = diffuseIntensity * u_lightColor * texDiffuse;

        // specular
        vec3 viewDir = normalize(u_viewPos - f_worldPos);
        vec3 halfWay = normalize(lightDir + viewDir);
        float specularIntensity = pow(max(dot(normal, halfWay), 0.0), u_shininess);
        vec3 specular = (u_specular * specularIntensity) * u_lightColor;

        // color
        FragColor = vec4(ambient + diffuse + specular, 1.0);
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


// The world
const worldShader = glance.buildShaderProgram(gl, "world-shader", worldVertexShader, worldFragmentShader, {
    u_ambient: 0.1,
    u_specular: 0.6,
    u_shininess: 64,
    u_lightPos: [0, 0, 5],
    u_lightColor: [1, 1, 1],
    u_projectionMatrix: projectionMatrix,
    u_matcap: 0,
})

const worldIBO = glance.createIndexBuffer(gl, glance.createTorusKnotIndices(
    128,     // tubularSegments
    32,      // radialSegments
))

const worldABO = glance.createAttributeBuffer(gl, "world-abo", glance.createTorusKnotAttributes(
    0.5,    // radius
    0.2,    // tube
    128,    // tubularSegments
    32,     // radialSegments
    2,      // p
    3,      // q
), {
    a_pos: { size: 3, type: gl.FLOAT },
    a_normal: { size: 3, type: gl.FLOAT },
    a_texCoord: { size: 2, type: gl.FLOAT },
})

const worldVAO = glance.createVAO(
    gl,
    "world-vao",
    worldIBO,
    glance.buildAttributeMap(worldShader, worldABO, ["a_pos", "a_normal"])
)
const worldMatcapTexture = glance.loadTexture(gl, 'img/matcap1.avif')
// const worldMatcapTexture = glance.loadTexture(gl, 'img/matcap2.avif')
// const worldMatcapTexture = glance.loadTexture(gl, 'img/matcap3.avif')
// const worldMatcapTexture = glance.loadTexture(gl, 'img/matcap4.avif')
// const worldMatcapTexture = glance.loadTexture(gl, 'img/matcap5.avif')
// const worldMatcapTexture = glance.loadTexture(gl, 'img/matcap6.avif')

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

const [skyCubemap, skyCubeMapLoaded] = glance.loadCubemap(gl, "sky-texture", [
    "img/Skybox_Right.avif",
    "img/Skybox_Left.avif",
    "img/Skybox_Top.avif",
    "img/Skybox_Bottom.avif",
    "img/Skybox_Front.avif",
    "img/Skybox_Back.avif",
])


// =============================================================================
// Draw Calls
// =============================================================================


// Scene State
let viewDist = 4.5
let viewPan = 0
let viewTilt = 0
// Variables for movement
let startTime = 0;
let relativeTime = 0;
let transformStartPos = [-2, -2, 2];
let transformEndPos = [0, 0, 0];
let transformPos = [0, 0, 0]

function restartMovement() {
    startTime = performance.now();
    transformPos[0] = transformStartPos[0];
    transformPos[1] = transformStartPos[1];
    transformPos[2] = transformStartPos[2];
    relativeTime = 0;
}

const worldDrawCall = glance.createDrawCall(
    gl,
    worldShader,
    worldVAO,
    {
        // uniform update callbacks
        // Objekt rotation
        u_modelMatrix: () => {
            let modelMatrix = mat4.identity();

            let direction = [transformEndPos[0] - transformStartPos[0], transformEndPos[1] - transformStartPos[1], transformEndPos[2] - transformStartPos[2]];
            let speed = 0.001; 

            for (let i = 0; i < 3; i++) {
                transformPos[i] = transformStartPos[i] + direction[i] * speed * relativeTime;
        
                if ((direction[i] > 0 && transformPos[i] > transformEndPos[i]) ||
                    (direction[i] < 0 && transformPos[i] < transformEndPos[i])) {
                    transformPos[i] = transformEndPos[i];
                }
            }
            modelMatrix = mat4.translate(modelMatrix, [transformPos[0], transformPos[1], transformPos[2]]);
            return modelMatrix;
        },
        // SkyBox rotation
        u_normalMatrix: (time) => mat3.fromMat4(mat4.transpose(mat4.invert(mat4.multiply(mat4.identity(), mat4.fromRotation(0.0002 * time, [0, 1, 0]))))),
        u_viewMatrix: () => mat4.invert(mat4.multiply(mat4.multiply(
            mat4.multiply(mat4.identity(), mat4.fromRotation(viewPan, [0, 1, 0])),
            mat4.fromRotation(viewTilt, [1, 0, 0])
        ), mat4.fromTranslation([0, 0, viewDist]))),
        u_viewPos: () => vec3.transformMat4(vec3.zero(), mat4.multiply(mat4.multiply(
            mat4.multiply(mat4.identity(), mat4.fromRotation(viewPan, [0, 1, 0])),
            mat4.fromRotation(viewTilt, [1, 0, 0])
        ), mat4.fromTranslation([0, 0, viewDist]))),
    },
    [
        // texture bindings
        [0, worldMatcapTexture],
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
    // gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    glance.performDrawCall(gl, worldDrawCall, time)
    glance.performDrawCall(gl, skyDrawCall, time)
})

onMouseDrag((e) =>
{
    viewPan += e.movementX * -.01
    viewTilt += e.movementY * -.01
})

function onMouseUp (e)
{
    restartMovement();
};

onMouseWheel((e) =>
{
    viewDist = Math.max(1.5, Math.min(10, viewDist * (1 + Math.sign(e.deltaY) * 0.2)))
})