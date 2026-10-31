/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPreviewTextFill } from "../src/content/preview-fill";

let controller: ReturnType<typeof createPreviewTextFill>;
let select: (target: HTMLElement, trusted?: boolean) => void;
beforeEach(()=>{
  document.title="测试申请表";document.body.innerHTML='<label>姓名<input id="name" value="原内容"></label><textarea id="detail"></textarea>';
  const listen=vi.spyOn(document,"addEventListener");
  controller=createPreviewTextFill(document);
  const handler=listen.mock.calls.find(([type])=>type==="pointerdown")![1] as EventListener;
  // 使用脱敏事件夹具验证信任边界，不修改浏览器事件的只读 isTrusted。
  select=(target,trusted=true)=>handler({isTrusted:trusted,type:"pointerdown",composedPath:()=>[target,document]} as unknown as Event);
});
afterEach(()=>{controller.dispose();vi.restoreAllMocks();});
const name=()=>document.querySelector<HTMLInputElement>('#name')!;
describe("预览文字双击填写",()=>{
 it("未选择控件和网页伪造点击不会写入",()=>{expect(controller.fill("示例").filled).toBe(false);select(name(),false);expect(controller.fill("示例").filled).toBe(false);expect(name().value).toBe("原内容")});
 it("只覆盖用户选中的控件，并通知页面框架",()=>{const changed=vi.fn(),input=vi.fn();name().addEventListener("change",changed);name().addEventListener("input",input);select(name());expect(controller.fill("测试同学")).toEqual({filled:true,changed:true});expect(name().value).toBe("测试同学");expect(document.querySelector('textarea')!.value).toBe("");expect(changed).toHaveBeenCalledOnce();expect(input).toHaveBeenCalledOnce();expect(controller.fill("测试同学")).toEqual({filled:true,changed:false})});
 it("多行文字保持换行，不把内容当 HTML",()=>{const field=document.querySelector('textarea')!;select(field);expect(controller.fill("第一行\n第二行").filled).toBe(true);expect(field.value).toBe("第一行\n第二行");const editor=document.createElement('div');editor.contentEditable="true";editor.setAttribute('contenteditable','true');document.body.append(editor);select(editor);expect(controller.fill('<img src=x>文本').filled).toBe(true);expect(editor.textContent).toBe('<img src=x>文本');expect(editor.querySelector('img')).toBeNull()});
 it.each(['password','file','checkbox','radio','hidden','submit'])("不修改 %s 控件，也不回填之前的控件",(type)=>{select(name());const field=document.createElement('input');field.type=type;document.body.append(field);select(field);expect(controller.fill('测试').filled).toBe(false);expect(name().value).toBe('原内容')});
 it("只读、禁用、隐藏和已经移除的目标必须重新选择",()=>{select(name());name().readOnly=true;expect(controller.fill('测试').filled).toBe(false);name().readOnly=false;name().disabled=true;expect(controller.fill('测试').filled).toBe(false);name().disabled=false;name().parentElement!.style.display='none';expect(controller.fill('测试').filled).toBe(false);name().parentElement!.style.display='';name().remove();expect(controller.fill('测试').filled).toBe(false)});
 it("格式和字数限制失败时保留原值",()=>{select(name());name().maxLength=2;expect(controller.fill('超过字数').filled).toBe(false);expect(name().value).toBe('原内容');name().removeAttribute("maxlength");name().type='email';name().value='fixture@example.com';expect(controller.fill('并非邮箱').filled).toBe(false);expect(name().value).toBe('fixture@example.com')});
 it("日期格式转换，并拒绝无法写入的日期",()=>{const field=name();field.type='date';field.value='2026-01-01';select(field);expect(controller.fill('2026/7/1').filled).toBe(true);expect(field.value).toBe('2026-07-01');expect(controller.fill('无效日期').filled).toBe(false);expect(field.value).toBe('2026-07-01')});
 it("网站取消 beforeinput 时不写入",()=>{name().addEventListener('beforeinput',e=>e.preventDefault());select(name());expect(controller.fill('测试').filled).toBe(false);expect(name().value).toBe('原内容')});
 it("网站在 beforeinput 期间移除目标时停止写入",()=>{const field=name();field.addEventListener('beforeinput',()=>field.remove());select(field);expect(controller.fill('测试').filled).toBe(false);expect(field.value).toBe('原内容')});
 it("安全验证页停止手动填写",()=>{document.title='网站安全验证';select(name());expect(controller.fill('测试').filled).toBe(false);expect(name().value).toBe('原内容')});
 it("清理或页面导航后，旧目标不会继续写入",()=>{select(name());controller.clear();expect(controller.fill('测试').filled).toBe(false);select(name());history.replaceState(null,'','#new-page');expect(controller.fill('测试').filled).toBe(false);history.replaceState(null,'',location.pathname)});
 it("支持用户选中的开放 Shadow DOM 控件",()=>{const host=document.createElement('div');document.body.append(host);const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<input>';const field=shadow.querySelector('input')!;select(field);expect(controller.fill('影子控件').filled).toBe(true);expect(field.value).toBe('影子控件')});
 it("同源 iframe 的控件保留自己的输入事件",()=>{const frame=document.createElement('iframe');document.body.append(frame);const child=frame.contentDocument!;child.body.innerHTML='<input>';const field=child.querySelector('input')!;select(field);expect(controller.fill('框架控件').filled).toBe(true);expect(field.value).toBe('框架控件');frame.remove();expect(controller.fill('失效').filled).toBe(false)});
 it("拒绝空文字和异常大消息",()=>{select(name());expect(controller.fill('').filled).toBe(false);expect(controller.fill(['测试']).filled).toBe(false);expect(controller.fill('字'.repeat(20001)).filled).toBe(false);expect(name().value).toBe('原内容')});
});
