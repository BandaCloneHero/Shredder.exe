namespace UnityEngine {
 public class MonoBehaviour { protected T GetComponent<T>() where T:class=>null; protected static T FindAnyObjectByType<T>()where T:class=>null; }
 public class SerializeField:System.Attribute{} public class HeaderAttribute:System.Attribute{public HeaderAttribute(string s){}} public class TooltipAttribute:System.Attribute{public TooltipAttribute(string s){}} public class MinAttribute:System.Attribute{public MinAttribute(float n){}} public class RangeAttribute:System.Attribute{public RangeAttribute(float a,float b){}}
 public static class Time{public static float deltaTime=.016f;}
 public static class Mathf { public static float Max(float a,float b)=>System.Math.Max(a,b);public static int Max(int a,int b)=>System.Math.Max(a,b);public static float Min(float a,float b)=>System.Math.Min(a,b);public static float Abs(float a)=>System.Math.Abs(a); public static float Clamp01(float a)=>Clamp(a,0,1);public static float Clamp(float a,float b,float c)=>System.Math.Clamp(a,b,c); public static float MoveTowards(float a,float b,float d)=>a+System.Math.Clamp(b-a,-d,d); }
 public class CanvasGroup{public float alpha;public bool interactable,blocksRaycasts;}
 public class GameObject{public T AddComponent<T>()where T:new()=>new T();}
}
namespace UnityEngine.UI {public class Slider {public float maxValue,value;public UnityEngine.GameObject gameObject=new();public T GetComponent<T>()where T:class=>null;}}
namespace YARG.Gameplay {}
namespace YARG.Gameplay.Judgments{public struct RhythmJudgmentResult{public float DamageMultiplier; public RhythmJudgmentResult(float damage){DamageMultiplier=damage;}}}
public class GepetoVisualAnimator { public void TriggerDeathAnimation(){}public void TriggerHitAnimation(){}public void TriggerPhase2Transformation(){} }
