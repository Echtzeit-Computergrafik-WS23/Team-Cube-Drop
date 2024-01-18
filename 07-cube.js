////////////////////////////////////////////////////////////////////////////////
// START OF BOILERPLATE CODE ///////////////////////////////////////////////////

// Get the WebGL context
const canvas = document.getElementById('canvas');
const body = document.querySelector('body');
const gl = canvas.getContext('webgl2', {alpha: true});

const playerCount = document.getElementById('playerCount');
var backgroundImgElement = document.querySelector(".backgroundImg");
let yOffset = 0;

let count = 0;

// Set the maximum rotation values for the camera.
const MAX_PAN  =  Math.PI // 8;
const MIN_PAN  = -Math.PI // 8;
const MAX_TILT =  Math.PI // 8;
const MIN_TILT = -Math.PI // 8;


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
    body.addEventListener('keydown', callback);
}

function onKeyUp(callback)
{
    canvas.addEventListener('keyup', callback);
}

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

// Solids ----------------------------------------------------------------------

const solidVertexShader = `#version 300 es
    precision highp float;

    uniform mat3 u_invLightRotation;
    uniform mat4 u_lightXform;
    uniform mat4 u_lightProjection;
    uniform mat4 u_viewXform;
    uniform mat4 u_cameraProjection;
    uniform vec3 u_viewPos;
    uniform mat4 u_modelMatrix;
    uniform mat3 u_normalMatrix;

    in mat4 a_modelMatrix;
    in vec3 a_pos;
    in vec3 a_normal;
    in vec3 a_tangent;
    in vec2 a_texCoord;

    out vec3 f_posTangentSpace;
    out vec4 f_posLightSpace;
    out vec3 f_lightDir;
    out vec3 f_viewPos;
    out vec2 f_texCoord;

    void main() {
        vec3 normal = u_normalMatrix * a_normal;
        vec3 tangent = u_normalMatrix * a_tangent;
        vec3 bitangent = cross(normal, tangent);
        mat3 tbn = transpose(mat3(tangent, bitangent, normal));

        // Transform world space coords to light space
        vec4 worldSpace = u_modelMatrix * vec4(a_pos, 1.0);
        f_posLightSpace = u_lightProjection * u_lightXform * worldSpace;

        // Transform world space coords to tangent space
        f_posTangentSpace = tbn * vec3(worldSpace);
        f_viewPos = tbn * u_viewPos;
        f_lightDir = tbn * u_invLightRotation * vec3(.0, .0, -1.0);

        f_texCoord = a_texCoord;

        gl_Position = u_cameraProjection * u_viewXform * worldSpace;
    }
`;

const solidFragmentShader = `#version 300 es
    precision mediump float;

    uniform float u_ambient;
    uniform float u_specular;
    uniform float u_shininess;
    uniform vec3 u_lightColor;
    uniform sampler2D u_texDiffuse;
    uniform sampler2D u_texSpecular;
    uniform sampler2D u_texNormal;
    uniform mediump sampler2DShadow u_texShadow;

    in vec3 f_posTangentSpace;
    in vec4 f_posLightSpace;
    in vec3 f_lightDir;
    in vec3 f_viewPos;
    in vec2 f_texCoord;

    out vec4 FragColor;

    float calculateShadow();

    void main() {

        // texture
        vec3 texDiffuse = texture(u_texDiffuse, f_texCoord).rgb;
        vec3 texSpecular = texture(u_texSpecular, f_texCoord).rgb;
        vec3 texNormal = texture(u_texNormal, f_texCoord).rgb;

        // ambient
        vec3 ambient = texDiffuse * u_ambient;

        // diffuse
        vec3 normal = normalize( // only apply the normal map at half strength
            mix(vec3(0., 0., 1.),
            texNormal * (255./128.) - 1.0,
            0.5));
        float diffuseIntensity = max(dot(normal, f_lightDir), 0.0);
        vec3 diffuse = diffuseIntensity * u_lightColor * texDiffuse;

        // specular
        vec3 viewDir = normalize(f_viewPos - f_posTangentSpace);
        vec3 halfWay = normalize(f_lightDir + viewDir);
        float specularIntensity = pow(max(dot(normal, halfWay), 0.0), u_shininess);
        vec3 specular = (u_specular * specularIntensity) * texSpecular * u_lightColor;

        // shadow
        float shadow = calculateShadow();

        // color
        FragColor = vec4(ambient + shadow * (diffuse + specular), 1.0);
    }

    // Returns a "random" number based on a vec3 and an int.
    float random(vec3 seed, int i){
        vec4 seed4 = vec4(seed,i);
        float dot_product = dot(seed4, vec4(12.9898,78.233,45.164,94.673));
        return fract(sin(dot_product) * 43758.5453);
    }

    float calculateShadow() {
        // Perspective divide.
        vec3 projCoords = f_posLightSpace.xyz / f_posLightSpace.w;

        // No shadow for fragments outside of the light's frustum.
        if(any(lessThan(projCoords, vec3(0))) || any(greaterThan(projCoords, vec3(1)))){
            return 1.0;
        }

        // Determine the bias based on the angle of the light hitting the texture
        float bias = max(0.05 * (1.0 - dot(vec3(0.0, 0.0, 1.0), f_lightDir)), 0.005);

        // Get the closest depth value from light's perspective.
        const vec2 poissonDisk[16] = vec2[](
            vec2( -0.94201624, -0.39906216 ),
            vec2( 0.94558609, -0.76890725 ),
            vec2( -0.094184101, -0.92938870 ),
            vec2( 0.34495938, 0.29387760 ),
            vec2( -0.91588581, 0.45771432 ),
            vec2( -0.81544232, -0.87912464 ),
            vec2( -0.38277543, 0.27676845 ),
            vec2( 0.97484398, 0.75648379 ),
            vec2( 0.44323325, -0.97511554 ),
            vec2( 0.53742981, -0.47373420 ),
            vec2( -0.26496911, -0.41893023 ),
            vec2( 0.79197514, 0.19090188 ),
            vec2( -0.24188840, 0.99706507 ),
            vec2( -0.81409955, 0.91437590 ),
            vec2( 0.19984126, 0.78641367 ),
            vec2( 0.14383161, -0.14100790 )
        );
        float visibility = 0.0;
        for (int i=0; i<16; i++){
            int index = int(16.0*random(floor(f_posTangentSpace.xyz*1000.0), i))%16;
            visibility += texture(u_texShadow, vec3(projCoords.xy + poissonDisk[index]/500.0, projCoords.z - bias));
        }
        return visibility / 16.0;
    }
`;

// Skybox ----------------------------------------------------------------------

const skyVertexShader = `#version 300 es
    precision highp float;

    uniform mat3 u_lightRotation;
    uniform mat3 u_viewRotation;
    uniform mat4 u_cameraProjection;

    in vec3 a_pos;

    out vec3 f_texCoord;

    // This matrix rotates the skybox so that the sun shines down the positive
    // Z axis instead of its native (unaligned) direction.
    const mat3 baseRotation = mat3(
        -0.9497352095434962, -0.0835014389652365, 0.30171268028391895,
        0.0, 0.9637708963658905, 0.26673143668883115,
        -0.3130543591029702, 0.2533242369155048, -0.9153271542119822
    );

    void main() {
        // Use the local position of the vertex as texture coordinate.
        f_texCoord = baseRotation * u_lightRotation * a_pos;

        // By setting Z == W, we ensure that the vertex is projected onto the
        // far plane, which is exactly what we want for the background.
        vec4 ndcPos = u_cameraProjection * inverse(mat4(u_viewRotation)) * vec4(a_pos, 1.0);
        gl_Position = ndcPos.xyww;
    }
`;

const skyFragmentShader = `#version 300 es
    precision mediump float;

    uniform samplerCube u_skybox;

    in vec3 f_texCoord;

    out vec4 FragColor;

    void main() {
        FragColor = texture(u_skybox, f_texCoord);
    }
`;

// Debug Quad ------------------------------------------------------------------

const quadVertexShader = `#version 300 es
    precision highp float;

    in vec2 a_pos;
    in vec2 a_texCoord;

    out vec2 f_texCoord;

    void main()
    {
        f_texCoord = a_texCoord;
        gl_Position = vec4(a_pos, 0.0, 1.0);
    }
`;

const quadFragmentShader = `#version 300 es
    precision mediump float;

    uniform sampler2D u_texture;

    in vec2 f_texCoord;

    out vec4 FragColor;

    void main() {
        float depth = texture(u_texture, f_texCoord).r;
        FragColor = vec4(vec3(depth), 1.0);
    }
`;

// Shadow ----------------------------------------------------------------------

const shadowVertexShader = `#version 300 es
precision highp float;

layout(location = 4) in vec3 a_pos;

uniform mat4 u_modelMatrix;
uniform mat4 u_lightXform;
uniform mat4 u_lightProjection;

void main()
{
    gl_Position = u_lightProjection * u_lightXform * u_modelMatrix * vec4(a_pos, 1.0);
}
`;

const shadowFragmentShader = `#version 300 es
    precision mediump float;

    void main() {}
`;

// =============================================================================
// Geometry
// =============================================================================

const cameraProjection = mat4.perspective(Math.PI / 4, 540 / 1080, 0.1, 14);

// left, right, bottom, top, near, and far clipping planes
const lightProjection = mat4.ortho(-2, 2, -1, 2, 0.1, 15);
const textureLightProjection = mat4.multiply(
    mat4.multiply(
        mat4.fromTranslation([0.5, 0.5, 0.5]),
        mat4.fromScaling([.5, .5, .5]),
    ),
    lightProjection,
);

const solidShader = glance.buildShaderProgram(gl, "floor-shader", solidVertexShader, solidFragmentShader, {
    u_ambient: 0.2,
    u_specular: 0.35,
    u_shininess: 64,
    u_lightColor: [1, 1, 1],
    u_cameraProjection: cameraProjection,
    u_lightProjection: textureLightProjection,
    u_texDiffuse: 0,
    u_texSpecular: 1,
    u_texNormal: 2,
    u_texShadow: 3,
});

const cubeShader = glance.buildShaderProgram(gl, "cube-shader", solidVertexShader, solidFragmentShader, {
    u_ambient: 0.3,
    u_specular: 0.5,
    u_shininess: 48,
    u_lightColor: [1, 1, 1],
    u_cameraProjection: cameraProjection,
    u_lightProjection: textureLightProjection,
    u_texDiffuse: 0,
    u_texSpecular: 1,
    u_texNormal: 2,
    u_texShadow: 3,
});

// Cube ------------------------------------------------------------------------

const { attributes: cubeAttr, indices: cubeIdx } = await glance.loadObj("./obj/wooden_box.obj", { tangents: true });

const cubeIBO = glance.createIndexBuffer(gl, cubeIdx);

const cubeABO = glance.createAttributeBuffer(gl, "cube-abo", cubeAttr, {
    a_pos: { size: 3, type: gl.FLOAT },
    a_texCoord: { size: 2, type: gl.FLOAT },
    a_normal: { size: 3, type: gl.FLOAT },
    a_tangent: { size: 3, type: gl.FLOAT },
});

const cubeTextureDiffuse = await glance.loadTextureNow(
    gl,
    "./img/wooden_box_BaseColor.png",
);

const cubeTextureNormal = await glance.loadTextureNow(
    gl,
    "./img/wooden_box_Normal.png",
);

const cubeTextureSpecular = await glance.loadTextureNow(
    gl,
    "./img/wooden_box_Roughness.png",
);
 
// Skybox ----------------------------------------------------------------------

const skyShader = glance.buildShaderProgram(gl, "sky-shader", skyVertexShader, skyFragmentShader, {
    u_cameraProjection: cameraProjection,
    u_skybox: 0,
});

const boxIndex = glance.createBoxIndices(true);
const boxAttributes = glance.createBoxAttributes(2, { normals: false, texCoords: false, sharedVertices: true });
const skyIBO = glance.createIndexBuffer(gl, boxIndex);
const skyABO = glance.createAttributeBuffer(gl, "sky-abo", boxAttributes, {
    a_pos: { size: 3, type: gl.FLOAT },
});

const skyVAO = glance.createVAO(gl, "sky-vao", skyIBO, glance.buildAttributeMap(skyShader, skyABO));

const skyCubemap = await glance.loadCubemapNow(gl, "sky-texture", [
    "./img/Skybox_Right.avif",
    "./img/Skybox_Left.avif",
    "./img/Skybox_Top.avif",
    "./img/Skybox_Bottom.avif",
    "./img/Skybox_Front.avif",
    "./img/Skybox_Back.avif",
]);

// Debug Quad ------------------------------------------------------------------

const quadShader = glance.buildShaderProgram(gl, "quad-shader", quadVertexShader, quadFragmentShader, {
    u_texture: 0,
});

const quadIBO = glance.createIndexBuffer(gl, glance.createQuadIndices());

const quadABO = glance.createAttributeBuffer(gl, "quad-abo", glance.createQuadAttributes(), {
    a_pos: { size: 2, type: gl.FLOAT },
    a_texCoord: { size: 2, type: gl.FLOAT },
});

const quadVAO = glance.createVAO(gl, "quad-vao", quadIBO, glance.buildAttributeMap(quadShader, quadABO));

// =============================================================================
// Shadow Setup
// =============================================================================

const shadowShader = glance.buildShaderProgram(gl, "shadow-shader", shadowVertexShader, shadowFragmentShader, {
    u_lightProjection: lightProjection,
});

const shadowDepthTexture = glance.createTexture(gl, "shadow-depth", 540, 1080 , gl.TEXTURE_2D, null, {
    useAnisotropy: false,
    // internalFormat: gl.DEPTH_COMPONENT16,
    internalFormat: gl.DEPTH_COMPONENT24,
    // internalFormat: gl.DEPTH_COMPONENT32F, 
    // levels: 1,
    filter: gl.LINEAR,
    compareFunc: gl.LEQUAL,
});

const shadowFramebuffer = glance.createFramebuffer(gl, "shadow-framebuffer", null, shadowDepthTexture);

// =============================================================================
// Draw Calls
// =============================================================================

// Scene State
let viewDist = 2.4;
let viewPan = 0;
let viewTilt = Math.PI / -25;
let panDelta = 0;
let tiltDelta = 0;

const viewRotation = new glance.Cached(
    () =>
        mat4.multiply(
            mat4.fromRotation(viewPan, [0, 1, 0]),
            mat4.fromRotation(viewTilt, [1, 0, 0]),
        )
);

const viewXform = new glance.Cached(
    () => mat4.multiply(
        viewRotation.get(),
        mat4.fromTranslation([0, 0, viewDist]),
    ),
    [viewRotation]
);

const invViewXform = new glance.Cached(
    () => mat4.invert(viewXform.get()),
    [viewXform]
);

const rotationSpeed = 0.00003;
const lightTilt = 0.1 ;
const lightRotation = new glance.TimeSensitive(
    (time) => mat3.fromMat4(mat4.multiply(
        mat4.fromRotation(-lightTilt, [1, 0, 0]),
        mat4.fromRotation(time * -rotationSpeed, [0, 1, 0]),
    )),
);
const invLightRotation = new glance.TimeSensitive(
    (time) => mat3.transpose(lightRotation.getAt(time)),
);
const lightXform = new glance.TimeSensitive(
    (time) => mat4.lookAt(
        // light position
        vec3.transformMat3([0, 2, -1 ], invLightRotation.getAt(time)),
        [0, 0, 0],
        [0, 1, 0]
    )
);

const modelMatrix = (position, scale, rotation = 0) => {
    return mat4.scale(mat4.rotate(mat4.translate(mat4.identity(), position), rotation, [-1, 0, 0]), scale);
}
const normalMatrix = (position, rotation = [0, 0, 0]) => {
    return mat3.fromMat4(mat4.rotate(mat4.translate(mat4.identity(), position), Math.PI / 2, rotation));
}

// Floor -----------------------------------------------------------------------

let floor = {
    position: [0, -.9, 0],
    floorVAO: null,
}

const floorIBO = glance.createIndexBuffer(gl, glance.createPlaneIndices());

const floorABO = glance.createAttributeBuffer(gl, "floor-abo", glance.createPlaneAttributes(1, 1, { tangents: true }), {
    a_pos: { size: 3, type: gl.FLOAT },
    a_normal: { size: 3, type: gl.FLOAT },
    a_texCoord: { size: 2, type: gl.FLOAT },
    a_tangent: { size: 3, type: gl.FLOAT },
});


floor.floorVAO = glance.createVAO(
    gl,
    "floor-vao",
    floorIBO,
    glance.buildAttributeMap(solidShader, [floorABO]),
);
const floorTextureDiffuse = await glance.loadTextureNow(gl, "./img/Rockwall_Diffuse.jpg");
const floorTextureSpecular = await glance.loadTextureNow(gl, "./img/Rockwall_Specular.jpg");
const floorTextureNormal = await glance.loadTextureNow(gl, "./img/Rockwall_Normal.jpg");

floor.drawCall = glance.createDrawCall(
    gl,
    solidShader,
    floor.floorVAO,
    {
        uniforms: {
            u_modelMatrix: () => modelMatrix(floor.position, [2, 2, 2], Math.PI / 2),
            u_normalMatrix: () => normalMatrix(floor.position, [-1, 0, 0]),
            u_lightXform: (time) => lightXform.getAt(time),
            u_invLightRotation: (time) => invLightRotation.getAt(time),
            u_viewXform: () => invViewXform.get(),
            u_viewPos: () => vec3.transformMat4(vec3.zero(), viewXform.get()),
        },
        textures: [
            [0, floorTextureDiffuse],
            [1, floorTextureSpecular],
            [2, floorTextureNormal],
            [3, shadowDepthTexture],
        ],
        cullFace: gl.BACK,
        depthTest: gl.LESS,
    }
);

// Beauty ----------------------------------------------------------------------

let tower = [
    {
        position: [0, -0.7, 0],
        cubeVAO: null,
        drawCall: null,
    },
    {
        position: [0, -0.3, 0],
        cubeVAO: null,
        drawCall: null,
    },
    {
        position: [0, 0.4 , 0],
        cubeVAO: null,
        drawCall: null,
    },
];
const cubeScale = [.4, .4, .4];

for (let i = 0; i < tower.length; i++) {
    let cube = tower[i]
    cube.cubeVAO = glance.createVAO(
        gl,
        "cube-vao",
        cubeIBO,
        glance.buildAttributeMap(solidShader, [cubeABO])
    );
    
    const cubeDrawCall = glance.createDrawCall(
        gl,
        cubeShader,
        cube.cubeVAO,
        {
            uniforms: {
                u_modelMatrix: () => mat4.scale(mat4.translate(mat4.identity(), cube.position), [.4, .4, .4]),
                u_normalMatrix: () => normalMatrix(cube.position),
                u_lightXform: (time) => lightXform.getAt(time),
                u_invLightRotation: (time) => invLightRotation.getAt(time),
                u_viewXform: () => invViewXform.get(),
                u_viewPos: () => vec3.transformMat4(vec3.zero(), viewXform.get()),
            },
            textures: [
                [0, cubeTextureDiffuse],
                [1, cubeTextureSpecular],
                [2, cubeTextureNormal],
                [3, shadowDepthTexture],
            ],
            cullFace: gl.BACK,
            depthTest: gl.LESS,
        }
    );
    cube.drawCall = cubeDrawCall
}


const skyDrawCall = glance.createDrawCall(
    gl,
    skyShader,
    skyVAO,
    {
        uniforms: {
            u_lightRotation: (time) => lightRotation.getAt(time),
            u_viewRotation: () => mat3.fromMat4(viewRotation.get()),
        },
        textures: [
            [0, skyCubemap],
        ],
        cullFace: gl.NONE,
        depthTest: gl.LEQUAL,
    }
);

const quadDrawCall = glance.createDrawCall(
    gl,
    quadShader,
    quadVAO,
    {
        textures: [
            [0, shadowDepthTexture],
        ],
        cullFace: gl.NONE,
        depthTest: gl.NONE,
    }
);

// Shadow ----------------------------------------------------------------------

let shadowDrawCalls = [];

for (const cube of tower) {
    shadowDrawCalls.push(
        glance.createDrawCall(
            gl,
            shadowShader,
            cube.cubeVAO,
            {
                uniforms: {
                    u_lightXform: (time) => lightXform.getAt(time),
                    u_modelMatrix: () => modelMatrix(cube.position, cubeScale),
                },
                cullFace: gl.BACK, // FRONT,
                depthTest: gl.LESS,
            }
        )
    )
}

shadowDrawCalls.push(
    glance.createDrawCall(
        gl,
        shadowShader,
        floor.floorVAO,
        {
            uniforms: {
                u_lightXform: (time) => lightXform.getAt(time),
                u_modelMatrix: () => modelMatrix(floor.position, cubeScale),
            },
            cullFace: gl.BACK, // FRONT,
            depthTest: gl.LESS,
        }
    )
)




// =============================================================================
// System Integration
// =============================================================================

onMouseDrag((e) =>
{
    viewPan += e.movementX * -.01;
    viewTilt += e.movementY * -.01;

    viewPan = Math.max(Math.min(viewPan, MAX_PAN), MIN_PAN);
    viewTilt = Math.max(Math.min(viewTilt, MAX_TILT), MIN_TILT);

    viewRotation.setDirty();
});

onMouseWheel((e) =>
{
    viewDist = Math.max(0.5, Math.min(5, viewDist * (1 + Math.sign(e.deltaY) * 0.2)));
    viewXform.setDirty();
});

onKeyDown((e) =>
{
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

        setTimeout(() => {
            const newCube = {
                position: [0, 1, 0],
                cubeVAO: null,
                drawCall: null,
            };

            newCube.cubeVAO = glance.createVAO(
                gl,
                "cube-vao",
                cubeIBO,
                glance.buildAttributeMap(solidShader, [cubeABO])
            );

            newCube.drawCall = glance.createDrawCall(
                gl,
                cubeShader,
                newCube.cubeVAO,
                {
                    uniforms: {
                        u_modelMatrix: () => modelMatrix(newCube.position, cubeScale),
                        u_normalMatrix: () => normalMatrix(newCube.position),
                        u_lightXform: (time) => lightXform.getAt(time),
                        u_invLightRotation: (time) => invLightRotation.getAt(time),
                        u_viewXform: () => invViewXform.get(),
                        u_viewPos: () => vec3.transformMat4(vec3.zero(), viewXform.get()),
                    },
                    textures: [
                        [0, cubeTextureDiffuse],
                        [1, cubeTextureSpecular],
                        [2, cubeTextureNormal],
                        [3, shadowDepthTexture],
                    ],
                    cullFace: gl.BACK,
                    depthTest: gl.LESS,
                }
            );

            shadowDrawCalls.push(
                glance.createDrawCall(
                    gl,
                    shadowShader,
                    newCube.cubeVAO,
                    {
                        uniforms: {
                            u_modelMatrix: () => modelMatrix(newCube.position, cubeScale),
                            u_lightXform: (time) => lightXform.getAt(time),
                        },
                        cullFace: gl.BACK, // FRONT,
                        depthTest: gl.LESS,
                    }
                )
            )

            tower.push(newCube);

            let startTime = null; // when the animation started
            let duration = 4000; // duration of the animation in milliseconds

            function animate(timestamp) {
                if (!startTime) startTime = timestamp; // if it's the first frame, set the start time
                let progress = (timestamp - startTime) / duration; // calculate progress

                // calculate new x position using sine function
                let newXPosition = Math.sin(progress * Math.PI * 2); // x position will go from -1 to 1 and back to -1 over the duration

                // update newCube's position
                newCube.position[0] = newXPosition;
                //updateShadowDrawCalls();

                // if newCube's y position is 1, request next frame
                if (newCube.position[1] == 1) {
                    requestAnimationFrame(animate);
                }
            }

            // start the animation
            if (newCube.position[1] == 1) {
                requestAnimationFrame(animate);
            }
        

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
                // Animate Floor to move down
                animateProperty(
                    floor.position,
                    1,
                    floor.position[1],
                    floor.position[1] - 0.4,
                    100,
                    () => {
                        startValue = endValue
                    }
                )
                count += 1;
                playerCount.innerHTML = count;

                yOffset += 30;
                backgroundImgElement.style.backgroundPosition = `0 ${yOffset}px`;
                tower.shift();
            }, 500)
        }, 1000)
    } 
});

onKeyUp((e) =>
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
});

const framebufferStack = new glance.FramebufferStack();

setRenderLoop((time) =>
{   
    if (panDelta != 0 || tiltDelta != 0) {
        viewPan += panDelta * .02;
        viewTilt += tiltDelta * .02;

        viewPan = Math.max(Math.min(viewPan, MAX_PAN), MIN_PAN);
        viewTilt = Math.max(Math.min(viewTilt, MAX_TILT), MIN_TILT);
        viewRotation.setDirty();
    }

    // Render shadow map
    framebufferStack.push(gl, shadowFramebuffer);
    {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        for (const drawCall of shadowDrawCalls) {
            glance.performDrawCall(gl, drawCall, time);
        }
    }
    framebufferStack.pop(gl);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (0)  {
        glance.performDrawCall(gl, quadDrawCall, time);
    } else {
        for (const cube of tower) {
            glance.performDrawCall(gl, cube.drawCall, time);
        }

        glance.performDrawCall(gl, floor.drawCall, time);
    }
});