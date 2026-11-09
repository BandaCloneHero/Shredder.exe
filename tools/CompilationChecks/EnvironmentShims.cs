// Compile-only substitutes for Unity/application services. Never included in Assets or invoked.
using System;
namespace UnityEngine {
 public static class Application { public static string dataPath => ""; public static string streamingAssetsPath => ""; }
 public static class Mathf {
 public static float Sqrt(float v)=>MathF.Sqrt(v); public static float Log10(float v)=>MathF.Log10(v); public static float Abs(float v)=>MathF.Abs(v); public static float Pow(float a,float b)=>MathF.Pow(a,b); public static bool Approximately(float a,float b)=>MathF.Abs(a-b)<0.00001f;
 public static float Round(float v)=>MathF.Round(v); public static int Min(int a,int b)=>Math.Min(a,b); public static float Min(float a,float b)=>Math.Min(a,b); public static float Max(float a,float b)=>Math.Max(a,b);
 }
}
namespace YARG.Settings {
 public class ValueSetting<T> { public T Value; }
 public static class SettingsManager { public static AudioSettings Settings; }
 public class AudioSettings {
 public ValueSetting<int> OutputChannelDefault,OutputChannelSfx,OutputChannelDrumSfx,OutputChannelVox,PlaybackBufferLength;
 public ValueSetting<float> VocalMonitoring,MicrophoneSensitivity;
 public ValueSetting<bool> UseWhammyFx,EnableNormalization,EnableVoxSamples;
 }
}
namespace YARG.Input { public static class InputManager { public static double CurrentInputTime => 0; } }
namespace YARG.Helpers { public class Timer { public void Start(float seconds, Action action) {} public void Stop() {} } }
namespace Cysharp.Threading.Tasks { public static class UniTask { public static System.Threading.Tasks.Task WaitUntil(Func<bool> predicate) => System.Threading.Tasks.Task.CompletedTask; } }
namespace YARG { public static class UnityMainThreadCallback { public static void QueueEvent(Action a) {} } }
namespace YARG.Menu.Persistent { public static class ToastManager { public static void ToastError(string message) {} } }
