# A Chaotic Kitchen

Game nấu ăn co-op **1–4 người** góc nhìn thứ nhất, chơi ngay trên trình duyệt – quán ăn Việt Nam. Món đầu tiên: **Bánh lọt xào tôm**.

## Chạy game

Cần Node.js. Lần đầu cài thư viện:

```bash
npm install
```

Mỗi lần chơi:

```bash
npm start
```

Mở http://localhost:5173 bằng Chrome/Edge. (Three.js được tải từ CDN nên cần có mạng.)

## Chơi cùng bạn bè (tối đa 4 người)

1. **Chủ quán (Host)** chạy `npm start`, mở game, nhập tên, giữ tích ô *“Mở phòng online”* rồi bấm **Mở quán mới** / **Tiếp tục**.
2. Màn hình đi chợ hiện **mã phòng** (ví dụ `TMZQ`) và link để gửi cho bạn bè.
3. **Bạn bè** mở link đó (hoặc mở trang game, nhập mã phòng) → **Vào phòng**.

Chủ quán giữ bản lưu (ngày, tiền, kho), đi chợ và quyết định khi nào cả nhóm về nhà ngủ.
Bạn bè vào giúp bếp: cầm đồ, nấu, rửa, phục vụ… mọi thao tác đều được máy chủ quán xác nhận nên tiền và nguyên liệu không bị nhân đôi.
Rớt mạng thì vào lại bằng **đúng tên cũ** để tiếp tục (giữ nguyên đồ đang cầm). Khi chơi online, quán **không dừng** khi ai đó mở menu – cẩn thận cháy chảo!

### Bạn bè ở đâu thì dùng link nào?

| Tình huống | Cách làm |
| --- | --- |
| Cùng mạng Wi-Fi | Dùng link `http://192.168.x.x:5173/?room=...` hiện trên màn hình. Lần đầu Windows hỏi tường lửa → chọn **Allow** cho Node.js. |
| Khác mạng, dùng VPN LAN (Radmin VPN, ZeroTier, Tailscale…) | Cả nhóm vào chung mạng VPN, dùng link có IP của VPN (Radmin VPN thường là `26.x.x.x`). |
| Khác mạng, không cài gì thêm | Tạo đường hầm công khai tới máy chủ quán, ví dụ với [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/): `cloudflared tunnel --url http://localhost:5173` → gửi link `https://....trycloudflare.com/?room=MÃ` cho bạn bè. |
| Muốn chạy 24/7 | Đưa thư mục này lên một dịch vụ chạy Node.js (Render, Railway, Fly.io…), lệnh chạy `npm start`. Máy chủ tự đọc cổng từ biến môi trường `PORT`. |

## Điều khiển

| Phím | Chức năng |
| --- | --- |
| W A S D / Shift | Di chuyển / chạy |
| Chuột | Nhìn |
| E | Cầm, đặt, cho nguyên liệu vào nồi/chảo, lấy đồ trong tủ |
| Chuột trái | Thao tác: khuấy (giữ + xoay chuột), đảo chảo (click), bóc tôm (giữ), cắt hẹ (click), rửa (giữ), ép bánh (giữ) |
| Lăn chuột / Z X | Chỉnh lửa ở bếp, chọn nguyên liệu trong tủ |
| H | Bật/tắt **hướng dẫn từng bước** (dòng vàng trên màn hình + mũi tên chỉ chỗ cần tới) |
| Tab | Sổ công thức |
| Esc | Tạm dừng / menu (chỉnh độ nhạy chuột ở đây) |

Mới chơi? Cứ làm theo dòng **“👉 Việc tiếp theo”** và mũi tên vàng – game sẽ chỉ từng thao tác từ làm bột đến mang món ra cho khách.

## Đã có

- Bếp 3D góc nhìn thứ nhất: kệ khô, kệ gia vị, tủ lạnh, tủ đông, bồn rửa, 2 bếp gas, thớt, khuôn ép, khay để ráo, chồng đĩa, thùng rác.
- **Giai đoạn A – làm sợi bánh lọt**: bột gạo + bột năng → nước → khuấy đều → nấu lửa nhỏ, khuấy liên tục → tắt bếp, thêm dầu → thau nước đá → ép (giữ áp lực vùng xanh) → vớt ra khay. 1 mẻ = 6 phần.
- **Giai đoạn B – xào theo đơn**: bóc tôm → rửa; rửa giá; rửa + cắt hẹ → chảo: dầu → tôm → bánh lọt → nước mắm, tiêu → giá, hẹ → múc ra đĩa.
- Chấm điểm món (0–100, 1–3 sao). Khách gọi món, dặn “không tiêu”, kiên nhẫn có hạn, trả tiền + tip, để lại đĩa bẩn.
- Ngày chơi: đi chợ → chuẩn bị → rung chuông mở cửa → phục vụ → tổng kết lãi/lỗ → về nhà ngủ (tự lưu).
- **Co-op online 4 người**: phòng theo mã, mỗi người một đầu bếp màu riêng, thấy nhau cầm đồ, quán đông khách hơn khi có nhiều người.

## Cấu trúc code

```
index.html, css/style.css   Giao diện, HUD, menu
server.js                   Máy chủ web + phòng chơi WebSocket (chuyển tin giữa Host và bạn bè)
src/main.js                 Khởi tạo, vòng lặp, nhập liệu (chơi 1 mình / Host / khách)
src/multiplayer.js          HostSession (chạy game, gửi trạng thái) & ClientSession (nhận và hiển thị)
src/net.js                  Kết nối WebSocket
src/avatar.js               Nhân vật đầu bếp của người chơi khác
src/world.js                Dựng quán và vị trí các trạm
src/stations.js             Các trạm (bếp, tủ, bàn...) và hình ảnh
src/items.js                Vật phẩm (nồi, chảo, tôm, đĩa...) và trạng thái
src/interact.js             Luật tương tác E / chuột trái / lăn chuột
src/recipes.js              Logic nấu, số liệu cân bằng, chấm điểm món
src/customers.js            Khách hàng (thật trên Host, bản sao trên máy bạn bè)
src/game.js                 Ngày chơi, tiền, kho, người chơi, lưu game
src/hud.js                  HUD, menu, cửa hàng, tổng kết
```

## Bước tiếp theo đề xuất

1. Nâng cấp bếp, bàn ghế; sự cố (chuột, mất điện, đổ nước).
2. Nhà ở chung sau giờ làm, tùy chỉnh nhân vật.
3. Thêm món (phở bò, bánh xèo, cơm tấm...).
