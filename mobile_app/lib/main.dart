import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:sensors_plus/sensors_plus.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]).then((_) {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    runApp(const NexusPadApp());
  });
}

class NexusPadApp extends StatelessWidget {
  const NexusPadApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NexusPad Ultimate',
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF121212),
        primaryColor: Colors.white,
      ),
      home: const LoginScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

// ==========================================
// 1. GİRİŞ VE YATAY LOBİ
// ==========================================
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late IO.Socket socket;
  final TextEditingController _pinController = TextEditingController();
  bool isConnected = false;
  String statusMsg = "Web ekranındaki kodu girin";

  @override
  void initState() {
    super.initState();
    _initSocket();
  }

  void _initSocket() {
    socket = IO.io('http://192.168.1.200:3000', <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': true,
    });

    socket.onConnect((_) => ifMounted(() => statusMsg = "Bağlanıldı. PIN bekleniyor..."));

    socket.on('joined-success', (_) => ifMounted(() {
      isConnected = true;
      statusMsg = "Bağlantı Başarılı!";
    }));

    socket.on('join-error', (err) => ifMounted(() {
      statusMsg = "Hata: $err";
      isConnected = false;
    }));

    socket.on('host-disconnected', (_) {
      ifMounted(() {
        _disconnectAndReset("Web ekranı kapatıldı! Lütfen yeni kod girin.");
      });
    });
  }

  // Kendi İsteğiyle veya Hata İle Çıkış Yapma
  void _disconnectAndReset(String msg) {
    socket.emit('motion-data', {'pin': _pinController.text, 'mode': 'disconnect_me'});
    setState(() {
      isConnected = false;
      _pinController.clear();
      statusMsg = msg;
    });
    HapticFeedback.heavyImpact();
  }

  void ifMounted(VoidCallback fn) { if (mounted) setState(fn); }

  void _goToController(String mode) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => GameControllerScreen(socket: socket, pin: _pinController.text, initialMode: mode)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // KLAVYE AÇILDIĞINDA EKRANI YENİDEN BOYUTLANDIRMASINI ENGELLER (TAŞMAYI ÖNLER)
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: !isConnected ? _buildLoginArea() : _buildModeSelection(),
            ),

            // BAĞLANTIYI KES VE GERİ DÖN BUTONU (Sadece bağlıyken görünür)
            if (isConnected)
              Positioned(
                bottom: 20,
                right: 20,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.redAccent.withOpacity(0.2),
                    foregroundColor: Colors.redAccent,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: const BorderSide(color: Colors.redAccent)),
                  ),
                  onPressed: () => _disconnectAndReset("Bağlantı kesildi. Yeni kod girin."),
                  icon: const Icon(Icons.exit_to_app),
                  label: const Text("BAĞLANTIYI KES", style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoginArea() {
    // TASARIM SIKIŞIKLIĞI (OVERFLOW) ÇÖZÜMÜ:
    // Row yerine Column kullandık ve Center/SingleChildScrollView içine aldık.
    // Klavye açılsa bile ekranda kayarak taşmayı engeller.
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset('assets/icon_steering_wheel.png', width: 60, color: Colors.white, errorBuilder: (_,__,___) => const Icon(Icons.gamepad, size: 60, color: Colors.white)),
            const SizedBox(height: 10),
            const Text("NEXUSPAD", style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 2)),
            const SizedBox(height: 30),

            SizedBox(
              width: 300,
              child: TextField(
                controller: _pinController,
                keyboardType: TextInputType.number,
                maxLength: 6,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 36, letterSpacing: 15, fontWeight: FontWeight.bold),
                decoration: InputDecoration(
                  counterText: "",
                  hintText: "000000",
                  filled: true,
                  fillColor: Colors.white10,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(15), borderSide: BorderSide.none),
                ),
              ),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                minimumSize: const Size(300, 55),
                backgroundColor: Colors.white,
                foregroundColor: Colors.black,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
              ),
              onPressed: () {
                HapticFeedback.heavyImpact();
                // Klavyeyi kapat
                FocusScope.of(context).unfocus();
                if (_pinController.text.length == 6) socket.emit('join-room', _pinController.text);
              },
              child: const Text("BAĞLAN", style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            ),
            const SizedBox(height: 15),
            Text(statusMsg, style: const TextStyle(color: Colors.grey, fontSize: 16)),
          ],
        ),
      ),
    );
  }

  Widget _buildModeSelection() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(left: 40.0),
          child: Text("OYNAMAK İÇİN BİR OYUN SEÇİN", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.grey)),
        ),
        const SizedBox(height: 20),
        SizedBox(
          height: 180,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 30),
            physics: const BouncingScrollPhysics(),
            children: [
              _gameCard("Yarış (1 Kişilik)", "racing_1p", 'assets/icon_steering_wheel.png', const Color(0xFF2E7D32)),
              _gameCard("Yarış (2 Kişilik)", "racing_2p", 'assets/icon_steering_wheel.png', const Color(0xFF1B5E20)),
              _gameCard("Uçak (1 Kişilik)", "flight_1p", 'assets/icon_arrow_rotate.png', const Color(0xFF1565C0)),
              _gameCard("Uçak (2 Kişilik)", "flight_2p", 'assets/icon_arrow_rotate.png', const Color(0xFF0D47A1)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _gameCard(String title, String mode, String assetPath, Color bgColor) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.heavyImpact();
        _goToController(mode);
      },
      child: Container(
        width: 250,
        margin: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(15),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(assetPath, width: 60, color: Colors.white, errorBuilder: (_,__,___) => const Icon(Icons.gamepad, size: 60, color: Colors.white)),
            const SizedBox(height: 15),
            Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white)),
          ],
        ),
      ),
    );
  }
}

// ==========================================
// 2. GLOBAL OYUN KONTROLCÜSÜ
// ==========================================
class GameControllerScreen extends StatefulWidget {
  final IO.Socket socket;
  final String pin;
  final String initialMode;

  const GameControllerScreen({super.key, required this.socket, required this.pin, required this.initialMode});

  @override
  State<GameControllerScreen> createState() => _GameControllerScreenState();
}

class _GameControllerScreenState extends State<GameControllerScreen> {
  StreamSubscription? _accelSub;
  Timer? _loopTimer;

  late String currentMode;
  Map<String, dynamic> inputs = {};
  bool isSensorSteering = true;
  double touchSteerAngle = 0;

  @override
  void initState() {
    super.initState();
    currentMode = widget.initialMode;

    widget.socket.on('host-disconnected', (_) {
      if (mounted) Navigator.pop(context);
    });

    _resetInputsForMode();
    _startSendingData();
  }

  void _resetInputsForMode() {
    if (currentMode.startsWith('racing')) {
      inputs = {'gas': false, 'brake': false, 'steering': 0.0, 'sensorMode': isSensorSteering};
    } else if (currentMode.startsWith('shooter')) {
      inputs = {'joyX': 0.0, 'joyY': 0.0, 'fire': false, 'jump': false, 'reload': false};
    } else if (currentMode.startsWith('flight')) {
      inputs = {'throttle': 0.0, 'fire': false};
    }
  }

  void _switchMode(String newMode) {
    HapticFeedback.heavyImpact();
    setState(() {
      currentMode = newMode;
      _resetInputsForMode();
    });
  }

  void _startSendingData() {
    try {
      _accelSub = accelerometerEventStream(samplingPeriod: SensorInterval.gameInterval)
          .listen((AccelerometerEvent event) {
        if (currentMode.startsWith('racing') && isSensorSteering) {
          double targetSteer = (event.y / 6.0).clamp(-1.0, 1.0);
          inputs['steering'] = inputs['steering'] + (targetSteer - inputs['steering']) * 0.3;
        }
      }, onError: (e) {
        debugPrint("Sensör erişilemiyor.");
      }, cancelOnError: true);
    } catch (e) {
      debugPrint("Sensör başlatılamadı.");
    }

    _loopTimer = Timer.periodic(const Duration(milliseconds: 33), (timer) {
      widget.socket.emit('motion-data', {
        'pin': widget.pin,
        'mode': currentMode,
        'inputs': inputs,
      });
    });
  }

  @override
  void dispose() {
    widget.socket.emit('motion-data', { 'pin': widget.pin, 'mode': 'menu', 'inputs': {} });
    widget.socket.off('host-disconnected');
    _accelSub?.cancel();
    _loopTimer?.cancel();
    super.dispose();
  }

  void updateInput(String key, dynamic value) {
    setState(() => inputs[key] = value);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          SafeArea(child: _buildCurrentController()),
          Positioned(
            top: 10, left: 20, right: 20,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(10)),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: currentMode,
                      icon: const Icon(Icons.arrow_drop_down, color: Colors.white),
                      dropdownColor: Colors.grey.shade900,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      items: const [
                        DropdownMenuItem(value: 'racing_1p', child: Text("Yarış (1P)")),
                        DropdownMenuItem(value: 'racing_2p', child: Text("Yarış (2P)")),
                        DropdownMenuItem(value: 'flight_1p', child: Text("Uçuş (1P)")),
                        DropdownMenuItem(value: 'flight_2p', child: Text("Uçuş (2P)")),
                      ],
                      onChanged: (val) => _switchMode(val!),
                    ),
                  ),
                ),
                IconButton(icon: const Icon(Icons.close, color: Colors.white54, size: 30), onPressed: () => Navigator.pop(context))
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCurrentController() {
    if (currentMode.startsWith('racing')) return _buildRacingUI();
    if (currentMode.startsWith('flight')) return _buildFlightUI();
    return const SizedBox();
  }

  Widget _buildRacingUI() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          flex: 1,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(height: 40),
              SwitchListTile(
                title: Text(isSensorSteering ? "Sensör Modu" : "Dokunmatik", style: const TextStyle(fontSize: 14)),
                activeColor: Colors.white,
                value: isSensorSteering,
                onChanged: (val) {
                  HapticFeedback.heavyImpact();
                  setState(() {
                    isSensorSteering = val;
                    inputs['sensorMode'] = val;
                    touchSteerAngle = 0;
                    inputs['steering'] = 0.0;
                  });
                },
              ),
              Expanded(
                child: !isSensorSteering
                    ? GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onPanUpdate: (details) {
                    setState(() {
                      double deltaX = (details.localPosition.dx - 100);
                      touchSteerAngle = deltaX.clamp(-90.0, 90.0);
                      inputs['steering'] = (touchSteerAngle / 90.0).clamp(-1.0, 1.0);
                    });
                  },
                  onPanEnd: (_) => setState(() { touchSteerAngle = 0; inputs['steering'] = 0.0; }),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Image.asset('assets/joystick_circle_pad_a.png', width: 160, color: Colors.white10),
                      Transform.rotate(
                        angle: touchSteerAngle * math.pi / 180,
                        child: Image.asset('assets/icon_steering_wheel.png', width: 100, color: Colors.white),
                      ),
                    ],
                  ),
                )
                    : Center(child: Image.asset('assets/icon_steering_wheel.png', width: 120, color: Colors.white24)),
              ),
            ],
          ),
        ),
        Expanded(
          flex: 1,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              FlatGamepadButton(
                iconAsset: 'assets/icon_pedal_brake.png',
                color: Colors.red,
                isPressed: inputs['brake'] ?? false,
                onPressDown: () { HapticFeedback.heavyImpact(); updateInput('brake', true); },
                onPressUp: () => updateInput('brake', false),
              ),
              FlatGamepadButton(
                iconAsset: 'assets/icon_pedal.png',
                color: Colors.green,
                isPressed: inputs['gas'] ?? false,
                onPressDown: () { HapticFeedback.heavyImpact(); updateInput('gas', true); },
                onPressUp: () => updateInput('gas', false),
              ),
            ],
          ),
        )
      ],
    );
  }

  Widget _buildFlightUI() {
    bool isFiring = inputs['fire'] ?? false;

    return Container(
      decoration: const BoxDecoration(
        image: DecorationImage(image: AssetImage('assets/background.png'), fit: BoxFit.cover),
      ),
      child: Row(
        children: [
          Expanded(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Image.asset('assets/tapLeft.png', width: 50),
                      const SizedBox(width: 20),
                      Image.asset('assets/tapRight.png', width: 50),
                    ],
                  ),
                  const SizedBox(height: 15),
                  const Text("YÖNLENDİRMEK İÇİN\nTELEFONU YATIRIN", textAlign: TextAlign.center, style: TextStyle(fontSize: 18, color: Colors.white, fontWeight: FontWeight.w900, shadows: [Shadow(color: Colors.black54, blurRadius: 4, offset: Offset(2, 2))])),
                ],
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (_) { HapticFeedback.heavyImpact(); updateInput('fire', true); },
                onTapUp: (_) => updateInput('fire', false),
                onTapCancel: () => updateInput('fire', false),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 100),
                  transform: Matrix4.translationValues(0, isFiring ? 10 : 0, 0),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Image.asset('assets/buttonLarge.png', width: 180, color: isFiring ? Colors.grey.shade400 : Colors.white),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Transform.rotate(angle: isFiring ? -0.2 : 0, child: Image.asset('assets/planeBlue1.png', width: 80)),
                          const SizedBox(height: 5),
                          Image.asset('assets/tap.png', width: 40),
                        ],
                      )
                    ],
                  ),
                ),
              ),
            ),
          )
        ],
      ),
    );
  }
}

class FlatGamepadButton extends StatelessWidget {
  final String iconAsset;
  final Color color;
  final double size;
  final bool isPressed;
  final VoidCallback onPressDown;
  final VoidCallback onPressUp;

  const FlatGamepadButton({super.key, required this.iconAsset, required this.color, this.size = 80, this.isPressed = false, required this.onPressDown, required this.onPressUp});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => onPressDown(),
      onTapUp: (_) => onPressUp(),
      onTapCancel: () => onPressUp(),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 50),
        width: size, height: size,
        decoration: BoxDecoration(
          color: isPressed ? color.withOpacity(0.8) : Colors.white10,
          borderRadius: BorderRadius.circular(15),
          border: Border.all(color: isPressed ? Colors.white : Colors.transparent, width: 2),
        ),
        child: Center(child: Image.asset(iconAsset, width: size * 0.5, color: isPressed ? Colors.white : color)),
      ),
    );
  }
}