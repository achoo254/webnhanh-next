/**
 * Every UI string of the app, Vietnamese first (the default), English second. `{name}` placeholders are filled by `t`;
 * `{app}` is the product name and `{domain}` the ecosystem's domain, both from brand.config.json.
 */
const vi = {
  'nav.features': 'Làm được gì',
  'nav.how': 'Cách dùng',
  'hero.title': 'Có trang web riêng mà không cần biết làm web',
  'hero.lede':
    'Chọn một mẫu, sửa chữ, thay ảnh, chọn màu rồi bấm Đăng. Trang của bạn có ngay địa chỉ riêng dạng tên-của-bạn.{sites} để gửi cho khách và bạn bè.',
  'signIn.title': 'Bắt đầu với tài khoản {domain}',
  'signIn.body': 'Dùng chung tài khoản với các app khác của {domain}. {app} đang được làm: đăng nhập trước, các tính năng sẽ mở dần.',
  'signIn.failed': 'Đăng nhập không thành công. Hãy thử lại.',
  'signIn.unavailable': 'Đăng nhập tạm thời chưa dùng được. Hãy quay lại sau ít phút.',
  'login.title': 'Đăng nhập vào {app}',
  'features.eyebrow': 'Làm được gì',
  'features.title': 'Một trang cho việc của bạn',
  'features.template.title': 'Làm trang từ mẫu',
  'features.template.body':
    'Mẫu bán hàng nhận đơn, thiệp cưới, quán ăn, hồ sơ cá nhân, thiệp chúc Tết. Sửa chữ, thay ảnh, chọn màu ngay trên điện thoại.',
  'features.address.title': 'Địa chỉ riêng, dễ nhớ',
  'features.address.body': 'Mỗi trang có một địa chỉ dạng tên-của-bạn.{sites}. Sửa rồi đăng lại, địa chỉ vẫn giữ nguyên.',
  'features.developer.title': 'Cho lập trình viên',
  'features.developer.body':
    'Gắn link repo git công khai hoặc tải lên file zip mã nguồn. Hệ thống tự build rồi đăng trang; mỗi lần push lên nhánh đã chọn là trang tự cập nhật.',
  'how.eyebrow': 'Cách dùng',
  'how.title': 'Ba bước là xong',
  'how.signIn.title': 'Đăng nhập',
  'how.signIn.body': 'Bằng tài khoản {domain} của bạn.',
  'how.make.title': 'Chọn mẫu hoặc đưa code',
  'how.make.body': 'Điền chữ và ảnh vào mẫu, hoặc gắn repo git, tải file zip lên.',
  'how.publish.title': 'Bấm Đăng',
  'how.publish.body': 'Nhận đường link để gửi qua Zalo, Facebook hay bất cứ đâu.',
  'home.title': 'Trang của bạn',
  'home.account': 'Bạn đang đăng nhập bằng tài khoản {domain}, dùng {app} từ {date}.',
  'home.empty.title': 'Bạn chưa có trang nào',
  'home.empty.body':
    'Tạo trang từ mẫu và đăng code cho lập trình viên đang được làm. Khi xong, bạn sẽ bắt đầu ngay tại đây, không cần làm gì thêm.',
  'home.signOut': 'Đăng xuất',
  'loading': 'Đang tải…',
  'notFound.title': 'Không có trang này',
  'notFound.back': 'Về trang chủ',
  'privacy.title': 'Quyền riêng tư',
  'terms.title': 'Điều khoản',
} as const;

export type MessageKey = keyof typeof vi;
export type Locale = 'vi' | 'en';

const en: Readonly<Record<MessageKey, string>> = {
  'nav.features': 'What it does',
  'nav.how': 'How it works',
  'hero.title': 'Your own web page, no web skills needed',
  'hero.lede':
    'Pick a template, change the text, swap the photos, choose the colours and press Publish. Your page gets its own address like your-name.{sites} to send to customers and friends.',
  'signIn.title': 'Start with your {domain} account',
  'signIn.body': 'The same account as the other {domain} apps. {app} is being built: sign in now, and the features open one by one.',
  'signIn.failed': 'Sign-in did not work. Please try again.',
  'signIn.unavailable': 'Sign-in is not available right now. Please come back in a few minutes.',
  'login.title': 'Sign in to {app}',
  'features.eyebrow': 'What it does',
  'features.title': 'A page for what you do',
  'features.template.title': 'Pages from templates',
  'features.template.body':
    'Templates for taking orders, wedding invitations, restaurants and shops, personal profiles, and Lunar New Year greetings. Change the text, photos and colours right on your phone.',
  'features.address.title': 'An address of its own',
  'features.address.body': 'Every page gets an address like your-name.{sites}. Edit and publish again, and the address stays the same.',
  'features.developer.title': 'For developers',
  'features.developer.body':
    'Link a public git repository or upload a zip of your source. It is built and published for you, and every push to the branch you chose updates the page.',
  'how.eyebrow': 'How it works',
  'how.title': 'Three steps',
  'how.signIn.title': 'Sign in',
  'how.signIn.body': 'With your {domain} account.',
  'how.make.title': 'Pick a template or bring code',
  'how.make.body': 'Fill a template with your text and photos, or link a git repository or upload a zip.',
  'how.publish.title': 'Press Publish',
  'how.publish.body': 'Get a link to share on Zalo, Facebook or anywhere else.',
  'home.title': 'Your pages',
  'home.account': 'You are signed in with your {domain} account and have used {app} since {date}.',
  'home.empty.title': 'You have no pages yet',
  'home.empty.body':
    'Making pages from templates and publishing code for developers are being built. Once ready, you will start right here, with nothing else to do.',
  'home.signOut': 'Sign out',
  'loading': 'Loading…',
  'notFound.title': 'There is no such page',
  'notFound.back': 'Back to the home page',
  'privacy.title': 'Privacy',
  'terms.title': 'Terms',
};

export const DICTIONARIES: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = { vi, en };
