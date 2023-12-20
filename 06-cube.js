////////////////////////////////////////////////////////////////////////////////
// START OF BOILERPLATE CODE ///////////////////////////////////////////////////

console.log('Hello, WebGL!');

// Get the WebGL context
const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2');

const playerCount = document.getElementById('playerCount');
let count = 0;

// Add mouse move event handlers to the canvas to update the cursor[] array.
const cursor = [0, 0];
canvas.addEventListener('mousemove', (event) =>
{
    cursor[0] = (event.offsetX / canvas.width) * 2 - 1;
    cursor[1] = (event.offsetY / canvas.height) * -2 + 1;
});

function onMouseDrag(callback)
{
    canvas.addEventListener('pointerdown', () =>
    {
        const stopDrag = () =>
        {
            canvas.removeEventListener("pointermove", callback);
            canvas.removeEventListener("pointerup", stopDrag);
            canvas.removeEventListener("pointerleave", stopDrag);
        };

        canvas.addEventListener('pointermove', callback);
        canvas.addEventListener("pointerup", stopDrag, { once: true });
        canvas.addEventListener("pointerleave", stopDrag, { once: true });
    });
}

function onMouseWheel(callback)
{
    canvas.addEventListener('wheel', callback);
}

function onKeyDown(callback)
{
    console.log('keydown');
    window.addEventListener('keydown', callback);
}

/*function onKeyUp(callback)
{
    canvas.addEventListener('keyup', callback);
}*/

// Basic render loop manager.
function setRenderLoop(callback)
{
    function renderLoop(time)
    {
        if (setRenderLoop._callback !== null) {
            setRenderLoop._callback(time);
            requestAnimationFrame(renderLoop);
        }
    }
    setRenderLoop._callback = callback;
    requestAnimationFrame(renderLoop);
}
setRenderLoop._callback = null;

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

import glance from './js/glance.js';

// BOILERPLATE END
////////////////////////////////////////////////////////////////////////////////

const {
    vec3,
    mat3,
    mat4,
} = glance;

// =============================================================================
// Shader Code
// =============================================================================

const bulbVertexShader = `#version 300 es
    precision highp float;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;

    in vec3 a_pos;

    void main() {
        gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_pos, 1.0);
    }
`;

const bulbFragmentShader = `#version 300 es
    precision mediump float;

    out vec4 FragColor;

    void main() {
        FragColor = vec4(1.0);
    }
`;

const phongVertexShader = `#version 300 es
    precision highp float;

    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform vec3 u_lightPos;
    uniform vec3 u_viewPos;
    uniform mat4 u_modelMatrix;

    in vec3 a_pos;
    in vec3 a_normal;
    in vec3 a_tangent;
    in mat3 a_normalMatrix;
    in vec2 a_texCoord;

    out vec3 f_worldPos;
    out vec3 f_lightPos;
    out vec3 f_viewPos;
    out vec2 f_texCoord;

    void main() {
        vec3 normal = a_normalMatrix * a_normal;
        vec3 tangent = a_normalMatrix * a_tangent;
        vec3 bitangent = cross(normal, tangent);
        mat3 tbn = transpose(mat3(tangent, bitangent, normal));

        // Transform world space coords to tangent space
        f_worldPos = tbn * vec3(u_modelMatrix * vec4(a_pos, 1.0));
        f_lightPos = tbn * u_lightPos;
        f_viewPos = tbn * u_viewPos;

        f_texCoord = a_texCoord;

        gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_pos, 1.0);
    }
`;

const phongFragmentShader = `#version 300 es
    precision mediump float;

    uniform float u_ambient;
    uniform float u_specular;
    uniform float u_shininess;
    uniform vec3 u_lightColor;
    uniform sampler2D u_texDiffuse;
    uniform sampler2D u_texSpecular;
    uniform sampler2D u_texNormal;
    uniform sampler2D u_texDepth;

    in vec3 f_worldPos;
    in vec3 f_lightPos;
    in vec3 f_viewPos;
    in vec2 f_texCoord;

    out vec4 FragColor;

    const float parallaxScale = 0.05;
    const float minLayers = 8.0;
    const float maxLayers = 32.0;

    vec2 parallax_mapping(vec3 viewDir) {
        float numLayers = mix(maxLayers, minLayers, smoothstep(0.0, 1.0, max(dot(vec3(0.0, 0.0, 1.0), viewDir), 0.0)));
        vec2 texCoordsDelta   = (viewDir.xy * parallaxScale) / (viewDir.z * numLayers);

        vec2  currentTexCoords     = f_texCoord;
        float currentDepthMapValue = 1.0 - texture(u_texDepth, currentTexCoords).r;
        float prevDepthMapValue    = currentDepthMapValue;

        float i = 0.0;
        for(;i / numLayers < currentDepthMapValue; i += 1.0)
        {
            prevDepthMapValue    = currentDepthMapValue;
            currentTexCoords    -= texCoordsDelta;
            currentDepthMapValue = 1.0 - texture(u_texDepth, currentTexCoords).r;
        }

        // get depth after and before collision for linear interpolation
        float afterDepth  = currentDepthMapValue - i / numLayers;
        float beforeDepth = prevDepthMapValue - max(i - 1.0, 0.0) / numLayers;

        float fraction = afterDepth / (afterDepth - beforeDepth);
        return currentTexCoords + (texCoordsDelta * fraction);
    }

    void main() {

        // parallax
        vec3 viewDir = normalize(f_viewPos - f_worldPos);
        vec2 texCoords = parallax_mapping(viewDir);
        if(texCoords.x > 1.0
            || texCoords.y > 1.0
            || texCoords.x < 0.0
            || texCoords.y < 0.0) {
            discard;
        }

        // texture
        vec3 texDiffuse = texture(u_texDiffuse, texCoords).rgb;
        vec3 texSpecular = texture(u_texSpecular, texCoords).rgb;
        vec3 texNormal = texture(u_texNormal, texCoords).rgb;

        // ambient
        vec3 ambient = texDiffuse * u_ambient;

        // diffuse
        vec3 normal = normalize(texNormal * 2.0 - 1.0);
        vec3 lightDir = normalize(f_lightPos - f_worldPos);
        float diffuseIntensity = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = diffuseIntensity * u_lightColor * texDiffuse;

        // specular
        vec3 halfWay = normalize(lightDir + viewDir);
        float specularIntensity = pow(max(dot(normal, halfWay), 0.0), u_shininess);
        vec3 specular = (u_specular * specularIntensity) * texSpecular * u_lightColor;

        // color
        FragColor = vec4(ambient + diffuse + specular, 1.0);
    }
`;

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
// Constants
// =============================================================================

const projectionMatrix = mat4.perspective(Math.PI / 4, 1, 0.1, 14);

// Quad ------------------------------------------------------------------------

const phongShader = glance.buildShaderProgram(gl, "phong-shader", phongVertexShader, phongFragmentShader, {
    u_ambient: 0.1,
    u_specular: 0.15,
    u_shininess: 128,
    u_lightColor: [1, 1, 1],
    u_projectionMatrix: projectionMatrix,
    u_texDiffuse: 0,
    u_texSpecular: 1,
    u_texNormal: 2,
    u_texDepth: 3,
});

const { attributes: monkeyAttr, indices: monkeyIdx } = await glance.loadObj("./obj/pallet.obj", {
    tangents: true,
});

const quadIBO = glance.createIndexBuffer(gl, monkeyIdx);

const quadABO = glance.createAttributeBuffer(gl, "quad-abo", monkeyAttr, {
    a_pos: { size: 3, type: gl.FLOAT },
    a_texCoord: { size: 2, type: gl.FLOAT },
    a_normal: { size: 3, type: gl.FLOAT },
    a_tangent: { size: 3, type: gl.FLOAT },
});

const quadXform = mat4.identity();
const quadModelMatrix = mat3.fromMat4(quadXform);
const quadInstanceAttributes = new Float32Array([...quadXform, ...quadModelMatrix]);
const quadIABO = glance.createAttributeBuffer(gl, "quad-iabo", quadInstanceAttributes, {
    a_modelMatrix: { size: 4, width: 4, type: gl.FLOAT, divisor: 1 },
    a_normalMatrix: { size: 3, width: 3, type: gl.FLOAT, divisor: 1 },
});

const quadVAO = glance.createVAO(
    gl,
    "quad-vao",
    quadIBO,
    glance.buildAttributeMap(phongShader, [quadABO, quadIABO]),
);
const quadTextureDiffuse = await glance.loadTextureNow(gl, "./img/Rockwall_Diffuse.jpg", {
    wrap: gl.REPEAT,
});
const quadTextureSpecular = await glance.loadTextureNow(gl, "./img/Rockwall_Specular.jpg", {
    wrap: gl.REPEAT,
});
const quadTextureNormal = await glance.loadTextureNow(gl, "./img/Rockwall_Normal.jpg", {
    wrap: gl.REPEAT,
});
const quadTextureDepth = await glance.loadTextureNow(gl, "./img/Rockwall_Depth.jpg", {
    wrap: gl.REPEAT,
});


// Bulb ------------------------------------------------------------------------

const bulbShader = glance.buildShaderProgram(gl, "bulb-shader", bulbVertexShader, bulbFragmentShader, {
    u_projectionMatrix: projectionMatrix,
});

const bulbIBO = glance.createIndexBuffer(gl, glance.createSphereIndices(5, 8));

const bulbABO = glance.createAttributeBuffer(gl, "bulb-abo", glance.createSphereAttributes(0.05, 5, 8, {
    normals: false,
    uvs: false,
}), {
    a_pos: { size: 3, type: gl.FLOAT },
});

const bulbVAO = glance.createVAO(
    gl,
    "bulb-vao",
    bulbIBO,
    glance.buildAttributeMap(bulbShader, bulbABO),
);

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

const [skyCubemap, skyCubeMapLoaded] = glance.loadCubemap(gl, "sky-texture", 2048, 2048,[
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


// Scene State
let viewDist = 3.5;
let viewPan = -0.3;
let viewTilt = -0.6;
let panDelta = 0;
let tiltDelta = 0;
const lightRadius = 2.0;
const lightSpeed = 0.0005;

let tower = [
    {
        position: [0, -1.4 , 0],
    },
    {
        position: [0, -1, 0],
    },
    {
        position: [0, 1.5 , 0],
    },
]

const viewRotationMatrix = new glance.Cached(
    () =>
        mat4.multiply(
            mat4.fromRotation(viewPan, [0, 1, 0]),
            mat4.fromRotation(viewTilt, [1, 0, 0]),
        )
);

const viewMatrix = new glance.Cached(
    () => mat4.multiply(
        viewRotationMatrix.get(),
        mat4.fromTranslation([0, 0, viewDist]),
    ),
    [viewRotationMatrix]
);

const lightPos = new glance.TimeSensitive(
    (time) => [
        Math.sin(time * lightSpeed) * lightRadius,
        0,
        Math.cos(time * lightSpeed) * lightRadius,
    ],
);

for (let i = 0; i < tower.length; i++) {
    let cube = tower[i]
    const cubeDrawCall = glance.createDrawCall(
        gl,
        phongShader,
        quadVAO,
        {
            uniforms: {
                u_lightPos: (time) => lightPos.getAt(time),
                u_viewMatrix: () => mat4.invert(viewMatrix.get()),
                u_viewPos: () => vec3.transformMat4(vec3.zero(), viewMatrix.get()),
                u_modelMatrix: () => mat4.translate(mat4.identity(), cube.position),
            },
            textures: [
                [0, quadTextureDiffuse],
                [1, quadTextureSpecular],
                [2, quadTextureNormal],
                [3, quadTextureDepth],
            ],
            cullFace: gl.BACK,
            depthTest: gl.LESS,
        },
    )
    cube.drawCall = cubeDrawCall
}

const bulbDrawCall = glance.createDrawCall(
    gl,
    bulbShader,
    bulbVAO,
    {
        uniforms: {
            u_modelMatrix: (time) => mat4.fromTranslation(lightPos.getAt(time)),
            u_viewMatrix: () => mat4.invert(viewMatrix.get()),
        },
        cullFace: gl.BACK,
        depthTest: gl.LESS,
    }
);

const skyDrawCall = glance.createDrawCall(
    gl,
    skyShader,
    skyVAO,
    {
        uniforms: {
            // uniform update callbacks
            u_viewRotationMatrix: () => mat3.fromMat4(mat4.multiply(
                mat4.multiply(mat4.identity(), mat4.fromRotation(viewPan, [0, 1, 0])),
                mat4.fromRotation(viewTilt, [1, 0, 0])
            )),
        },
        cullFace: gl.BACK,
        depthTest: gl.LESS,
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
    if (panDelta != 0 || tiltDelta != 0) {
        viewPan += panDelta * .02;
        viewTilt += tiltDelta * .02;
        viewRotationMatrix.setDirty();
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    for (let i = 0; i < tower.length; i++) {
        let cube = tower[i]
        glance.performDrawCall(gl, cube.drawCall, time)
    }

    glance.performDrawCall(gl, skyDrawCall, time)
    glance.performDrawCall(gl, bulbDrawCall, time);
    // glance.performDrawCall(gl, quadDrawCall, time);
});

onMouseDrag((e) =>
{
    viewPan += e.movementX * -.01;
    viewTilt += e.movementY * -.01;
    viewRotationMatrix.setDirty();
});

onMouseWheel((e) =>
{
    viewDist = Math.max(1.5, Math.min(10, viewDist * (1 + Math.sign(e.deltaY) * 0.2)));
    viewMatrix.setDirty();
});

onKeyDown((e) => {
    if (e.key == " ") {
        console.log('space');
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
                phongShader,
                quadVAO,
                {
                    uniforms: {
                        // uniform update callbacks
                        u_lightPos: (time) => lightPos.getAt(time),
                        u_modelMatrix: (time) => {
                            if (newCube.position[1] == 1.5) {
                                newCube.position[0] = moveRange * Math.sin(time * moveSpeed * count);
                            }
                            return mat4.translate(mat4.identity(), newCube.position);
                        },
                        u_viewPos: () => vec3.transformMat4(vec3.zero(), viewMatrix.get()),
                        u_viewMatrix: () => mat4.invert(mat4.multiply(mat4.multiply(
                            mat4.multiply(mat4.identity(), mat4.fromRotation(viewPan, [0, 1, 0])),
                            mat4.fromRotation(viewTilt, [1, 0, 0])
                        ), mat4.fromTranslation([0, 0, viewDist]))),    
                    },
                    textures: [
                        [0, quadTextureDiffuse],
                        [1, quadTextureSpecular],
                        [2, quadTextureNormal],
                        [3, quadTextureDepth],
                    ],
                    cullFace: gl.BACK,
                    depthTest: gl.LESS,
                },
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
    if (e.key == "ArrowLeft") {
        panDelta = Math.max(panDelta - 1, -1);
    }
    if (e.key == "ArrowRight") {
        panDelta = Math.min(panDelta + 1, 1);
    }
    if (e.key == "ArrowUp") {
        tiltDelta = Math.max(tiltDelta - 1, -1);
    }
    if (e.key == "ArrowDown") {
        tiltDelta = Math.min(tiltDelta + 1, 1);
    }
}) 

/*onKeyUp((e) =>
{
    if (e.key == "ArrowLeft") {
        panDelta = Math.min(panDelta + 1, 1);
    }
    if (e.key == "ArrowRight") {
        panDelta = Math.max(panDelta - 1, -1);
    }
    if (e.key == "ArrowUp") {
        tiltDelta = Math.min(tiltDelta + 1, 1);
    }
    if (e.key == "ArrowDown") {
        tiltDelta = Math.max(tiltDelta - 1, -1);
    }
});*/