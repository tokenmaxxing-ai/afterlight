# Earth texture sources

Downloaded 2026-09-22 from the official `mrdoob/three.js` repository. Original image bytes retained; only local filenames changed. All four maps are 2048 × 1024 equirectangular Earth images. No generative imagery or locally invented geography was used.

| File | Format | Bytes | Source |
|---|---|---:|---|
| earth-day.jpg | RGB JPEG | 512606 | https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/textures/planets/earth_atmos_2048.jpg |
| earth-night.png | RGB PNG | 734910 | https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/textures/planets/earth_lights_2048.png |
| earth-ocean.jpg | RGB JPEG, grayscale content | 223421 | https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/textures/planets/earth_specular_2048.jpg |
| earth-clouds.png | RGBA PNG | 4428595 | https://raw.githubusercontent.com/mrdoob/three.js/r150/examples/textures/planets/earth_clouds_2048.png |

## Rendering notes

- Day map: color texture; load using sRGB color space. It is a composite illustration based on Earth imagery, not a live satellite frame.
- Night map: contains RGB city lights plus a very dark blue land/ocean background; load using sRGB. Mask emission to the unlit hemisphere. It is not a pure black-background light mask.
- Ocean/specular map: white water, black land, including land detail and rivers. Treat as non-color data; white should produce stronger specular response and lower roughness.
- Clouds: use its native alpha channel. RGB values are pale gray/white; alpha ranges from 7 to 254. Do not use the RGB channel as the opacity mask. Transparent material, depthWrite false, on a slightly larger sphere gives a usable cloud shell. This map is from r150 because r180 retains only a 1024 cloud map. Geography/cloud composition is historical, not live weather.
- Latitude is north-up and the central meridian runs near the horizontal center. Day/night/ocean features were visually inspected and have matching continental positioning.

## Credit and licensing evidence

Recommended compact credit: "Earth texture assets: three.js examples. Earth diffuse and city-light imagery credited by three.js to Sean Ward."

The official three.js r150 tone-mapping example explicitly credits Earth diffuse and city lights to Sean Ward, and loads the cloud/specular/lights maps listed above:
https://raw.githubusercontent.com/mrdoob/three.js/r150/examples/webgl_shaders_tonemapping.html

The three.js repository carries the MIT license. Its complete license text is retained at `../vendor/THREE-LICENSE.txt` as `THREE-LICENSE.txt`:
https://raw.githubusercontent.com/mrdoob/three.js/r180/LICENSE

NASA's primary Blue Marble documentation explains the satellite-data mosaic method and credits Reto Stöckli / Robert Simmon / NASA Goddard, with MODIS and other datasets including DMSP city lights:
https://science.nasa.gov/resource/blue-marble/
https://science.nasa.gov/earth/earth-observatory/history-of-the-blue-marble/

NASA describes its Blue Marble source files as free to use and modify without implying NASA affiliation:
https://science.nasa.gov/blogs/earth-matters/2011/10/06/crafting-the-blue-marble/

NASA general imagery and texture-map usage guidance:
https://www.nasa.gov/nasa-brand-center/images-and-media/

The exact upstream NASA lineage of these specific three.js derivative files was not independently verified. Do not label them as a direct NASA download or assert NASA authorship of the whole rendered experience. Their direct, verified distribution source is the official three.js repository and the example-specific Sean Ward credit above.
