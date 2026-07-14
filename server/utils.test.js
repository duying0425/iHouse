import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractBase64Images, collectImageRefs } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGES_DIR = path.join(__dirname, "temp-test-images");

// Example 1x1 pixel PNG and JPEG base64 strings
const mockPngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const mockJpegBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

describe("extractBase64Images", () => {
  beforeAll(() => {
    // Create temp directory for images
    if (!fs.existsSync(TEST_IMAGES_DIR)) {
      fs.mkdirSync(TEST_IMAGES_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up temp directory and its contents
    if (fs.existsSync(TEST_IMAGES_DIR)) {
      const files = fs.readdirSync(TEST_IMAGES_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEST_IMAGES_DIR, file));
      }
      fs.rmdirSync(TEST_IMAGES_DIR);
    }
  });

  it("should return false and not modify non-object inputs", () => {
    expect(extractBase64Images(null, TEST_IMAGES_DIR)).toBe(false);
    expect(extractBase64Images("string", TEST_IMAGES_DIR)).toBe(false);
    expect(extractBase64Images(123, TEST_IMAGES_DIR)).toBe(false);
  });

  it("should return false and not modify objects without base64 images", () => {
    const input = {
      name: "Living Room",
      items: [
        { id: 1, name: "Chair", image: "/api/images/chair.jpg" },
        { id: 2, name: "Table", image: null }
      ],
      emptyArray: []
    };
    const originalInput = JSON.parse(JSON.stringify(input));

    const result = extractBase64Images(input, TEST_IMAGES_DIR);

    expect(result).toBe(false);
    expect(input).toEqual(originalInput);
  });

  it("should extract base64 image, save to file, and replace with URL path", () => {
    const input = {
      image: mockPngBase64
    };

    const result = extractBase64Images(input, TEST_IMAGES_DIR);

    expect(result).toBe(true);
    expect(input.image).toMatch(/^\/api\/images\/[a-f0-9]{32}\.png$/);

    // Verify file actually written to the directory
    const hash = input.image.split("/").pop().split(".")[0];
    const filePath = path.join(TEST_IMAGES_DIR, `${hash}.png`);
    expect(fs.existsSync(filePath)).toBe(true);

    const fileContent = fs.readFileSync(filePath);
    expect(fileContent.length).toBeGreaterThan(0);
  });

  it("should extract nested and array base64 images", () => {
    const input = {
      floorPlan: mockJpegBase64,
      areas: [
        {
          name: "Kitchen",
          images: [mockPngBase64, "/api/images/existing.jpg"],
          nestedObj: {
            detailImage: mockPngBase64
          }
        }
      ]
    };

    const result = extractBase64Images(input, TEST_IMAGES_DIR);

    expect(result).toBe(true);
    expect(input.floorPlan).toMatch(/^\/api\/images\/[a-f0-9]{32}\.jpeg$/);
    expect(input.areas[0].images[0]).toMatch(/^\/api\/images\/[a-f0-9]{32}\.png$/);
    expect(input.areas[0].images[1]).toBe("/api/images/existing.jpg");
    expect(input.areas[0].nestedObj.detailImage).toMatch(/^\/api\/images\/[a-f0-9]{32}\.png$/);

    // Verify files were created
    const jpghash = input.floorPlan.split("/").pop().split(".")[0];
    const pnghash = input.areas[0].images[0].split("/").pop().split(".")[0];
    const nestedPnghash = input.areas[0].nestedObj.detailImage.split("/").pop().split(".")[0];

    expect(fs.existsSync(path.join(TEST_IMAGES_DIR, `${jpghash}.jpeg`))).toBe(true);
    expect(fs.existsSync(path.join(TEST_IMAGES_DIR, `${pnghash}.png`))).toBe(true);
    expect(fs.existsSync(path.join(TEST_IMAGES_DIR, `${nestedPnghash}.png`))).toBe(true);
  });

  it("should ignore invalid base64 image data gracefully", () => {
    const input = {
      image1: "data:image/png;notbase64,content",
      image2: "data:text/plain;base64,aGVsbG8="
    };
    const originalInput = JSON.parse(JSON.stringify(input));

    const result = extractBase64Images(input, TEST_IMAGES_DIR);

    // Should not crash and not modify the invalid data
    expect(result).toBe(false);
    expect(input).toEqual(originalInput);
  });
});

describe("collectImageRefs", () => {
  it("收集形如 /api/images/xxx.ext 的引用", () => {
    const home = {
      floorPlanImage: "/api/images/floor.png",
      areas: [
        {
          images: [{ url: "/api/images/living.jpg" }],
          items: [{ image: "/api/images/sofa.png" }],
        },
      ],
    };
    const refs = collectImageRefs(home);
    expect(refs).toBeInstanceOf(Set);
    expect(Array.from(refs).sort()).toEqual(
      ["floor.png", "living.jpg", "sofa.png"].sort()
    );
  });

  it("嵌套对象和数组都能遍历", () => {
    const home = {
      areas: [
        {
          images: [
            { url: "/api/images/a.png" },
            { url: "/api/images/b.png" },
          ],
          items: [
            {
              image: "/api/images/c.png",
              gallery: ["/api/images/g1.jpg", "/api/images/g2.jpg"],
              contents: [{ remark: "/api/images/nested.png" }],
            },
          ],
        },
      ],
    };
    const refs = Array.from(collectImageRefs(home)).sort();
    expect(refs).toEqual(
      ["a.png", "b.png", "c.png", "g1.jpg", "g2.jpg", "nested.png"].sort()
    );
  });

  it("去重相同的引用", () => {
    const home = {
      areas: [
        { items: [{ image: "/api/images/dup.png" }] },
        { items: [{ image: "/api/images/dup.png" }] },
      ],
      floorPlanImage: "/api/images/dup.png",
    };
    expect(collectImageRefs(home)).toEqual(new Set(["dup.png"]));
  });

  it("不收集外部 URL 与 base64 数据", () => {
    const home = {
      floorPlanImage: "https://example.com/foo.png",
      externalUrl: "http://img.com/x.jpg",
      base64: "data:image/png;base64,abc",
      areas: [
        { items: [{ image: "/api/images/real.png" }] },
      ],
    };
    expect(collectImageRefs(home)).toEqual(new Set(["real.png"]));
  });

  it("对 null / undefined / 原始类型不抛错", () => {
    expect(collectImageRefs(null)).toEqual(new Set());
    expect(collectImageRefs(undefined)).toEqual(new Set());
    expect(collectImageRefs("string")).toEqual(new Set());
    expect(collectImageRefs(123)).toEqual(new Set());
    expect(collectImageRefs([])).toEqual(new Set());
  });

  it("空对象返回空集合", () => {
    expect(collectImageRefs({})).toEqual(new Set());
    expect(collectImageRefs({ areas: [] })).toEqual(new Set());
    expect(collectImageRefs({ areas: [{ items: [] }] })).toEqual(new Set());
  });

  it("保留文件名中的点与多扩展名", () => {
    const home = {
      areas: [{ items: [{ image: "/api/images/photo.tar.gz" }] }],
    };
    expect(collectImageRefs(home)).toEqual(new Set(["photo.tar.gz"]));
  });
});
