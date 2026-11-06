import { describe, expect, it } from "vitest";
import { moduleFieldKey, moduleKindFromNavId, moduleKindFromTitle } from "../src/shared/form-modules";

describe("按模块解释字段标题", () => {
  it("导航标记和区块标题都能认出项目、教育、实习", () => {
    expect(moduleKindFromNavId("block-projectInfo")).toBe("project");
    expect(moduleKindFromNavId("block-educationInfo")).toBe("education");
    expect(moduleKindFromNavId("block-practiceInfo")).toBe("work");
    expect(moduleKindFromTitle("项目经验")).toBe("project");
    expect(moduleKindFromTitle("教育背景")).toBe("education");
    expect(moduleKindFromTitle("实习经历")).toBe("work");
  });

  it("同一句起止时间，在不同模块里分别是项目、教育和实习时间", () => {
    expect(moduleFieldKey("project", "起止时间")).toBe("date");
    expect(moduleFieldKey("education", "起止时间")).toBe("date");
    expect(moduleFieldKey("work", "起止时间")).toBe("date");
    expect(moduleFieldKey("project", "项目名称")).toBe("projectName");
    expect(moduleFieldKey("project", "职责")).toBe("projectRole");
    expect(moduleFieldKey("project", "项目描述")).toBe("projectDescription");
    expect(moduleFieldKey("project", "项目中职责")).toBe("projectDescription");
    expect(moduleFieldKey("education", "学校名称")).toBe("school");
    expect(moduleFieldKey("work", "公司名称")).toBe("company");
  });
});
