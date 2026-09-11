# Kế hoạch Triển khai: Ứng dụng HTA Offline Đổi Mật Khẩu Hàng Loạt Qua SMB

## 1. Bối Cảnh (Context)
- Đổi mật khẩu tài khoản người dùng máy trạm qua mạng nội bộ từ máy quản trị.
- Máy trạm chỉ mở SMB (Port 445) và FTP.
- Giao diện HTML trực quan, 100% offline, không mở port/web server.
- Hỗ trợ nhập nhiều dải IP, tự động thăm dò và thử lại máy chưa online.

## 2. Kiến Trúc (Architecture)
- Tệp thực thi: `pwd-update.hta` (chạy qua `mshta.exe` có sẵn trên Windows).
- Xử lý ngầm: PowerShell ADSI WinNT qua kết nối SMB IPC$.
- Non-blocking UI: Quản lý hàng đợi qua timer JavaScript và `WScript.Shell.Exec`.

## 3. Các Bước Thực Hiện
1. Tạo giao diện HTML/CSS phong cách dashboard phẳng, tối ưu hiển thị trên IE11/HTA.
2. Xây dựng logic phân giải dải IP linh hoạt (IP đơn, dải gạch ngang, nhiều dòng).
3. Xây dựng worker PowerShell kiểm tra port 445 và thực thi đổi mật khẩu.
4. Cơ chế tự động thử lại (retry queue) cho máy offline và cập nhật badge trạng thái.
5. Tính năng xuất báo cáo kết quả sang CSV.
