using UnityEngine;
using UnityEngine.UI;
using YARG;

[DisallowMultipleComponent]
[RequireComponent(typeof(Image))]
public sealed class BossEmblemAnimator : MonoBehaviour
{
    [SerializeField] private BossHealthBar bossHealthBar;
    [SerializeField] private Sprite normalSprite;
    [SerializeField] private Sprite hitSprite;
    [SerializeField] private Sprite phase2Sprite;
    [Min(0.01f)] [SerializeField] private float hitDuration = 0.18f;
    [Min(0f)] [SerializeField] private float minimumHitInterval = 0.28f;
    [Min(0.01f)] [SerializeField] private float transformationDuration = 0.45f;

    private Image emblem;
    private RectTransform emblemRect;
    private Vector2 restingPosition;
    private Vector3 restingScale;
    private Color restingColor;
    private float hitRemaining;
    private float transformationRemaining;
    private float nextHitTime;
    private bool phase2;

    private void Awake()
    {
        emblem = GetComponent<Image>();
        emblemRect = emblem.rectTransform;
        restingPosition = emblemRect.anchoredPosition;
        restingScale = emblemRect.localScale;
        restingColor = emblem.color;
        if (normalSprite == null) normalSprite = emblem.sprite;
        if (bossHealthBar == null) bossHealthBar = GetComponentInParent<BossHealthBar>();
    }

    private void OnEnable()
    {
        hitRemaining = transformationRemaining = 0f;
        nextHitTime = 0f;
        phase2 = false;
        if (bossHealthBar != null)
        {
            bossHealthBar.Damaged += OnDamaged;
            bossHealthBar.Defeated += OnDefeated;
        }
    }

    private void OnDisable()
    {
        if (bossHealthBar != null)
        {
            bossHealthBar.Damaged -= OnDamaged;
            bossHealthBar.Defeated -= OnDefeated;
        }
        RestoreTransform();
        if (emblem != null) emblem.sprite = normalSprite;
    }

    private void OnDamaged()
    {
        // Let rapid note hits finish a reaction before starting another one.
        if (Time.time < nextHitTime) return;
        nextHitTime = Time.time + Mathf.Max(hitDuration, minimumHitInterval);
        hitRemaining = hitDuration;
    }

    private void OnDefeated()
    {
        hitRemaining = transformationRemaining = 0f;
        RestoreTransform();
    }

    private void LateUpdate()
    {
        if (bossHealthBar == null) return;
        // CurrentPhase is latched by combat, so healing above half does not undo the expression.
        bool nowPhase2 = bossHealthBar.CurrentPhase == 2;
        if (phase2 != nowPhase2)
        {
            phase2 = nowPhase2;
            hitRemaining = 0f;
            transformationRemaining = bossHealthBar.IsDefeated ? 0f : transformationDuration;
        }

        bool reacting = hitRemaining > 0f && !bossHealthBar.IsDefeated;
        Sprite target = phase2 && phase2Sprite != null ? phase2Sprite : normalSprite;
        if (reacting && !phase2 && hitSprite != null) target = hitSprite;
        if (emblem.sprite != target) emblem.sprite = target;

        RestoreTransform();
        if (transformationRemaining > 0f)
        {
            float progress = 1f - transformationRemaining / transformationDuration;
            float pulse = Mathf.Sin(progress * Mathf.PI);
            emblemRect.localScale = restingScale * (1f + pulse * 0.12f);
            transformationRemaining = Mathf.Max(0f, transformationRemaining - Time.deltaTime);
        }
        else if (reacting)
        {
            float progress = 1f - hitRemaining / hitDuration;
            float envelope = 1f - progress;
            emblemRect.anchoredPosition = restingPosition +
                new Vector2(Mathf.Sin(progress * Mathf.PI * 6f) * 3f * envelope, 0f);
            emblemRect.localScale = Vector3.Scale(restingScale,
                new Vector3(1f + envelope * 0.06f, 1f - envelope * 0.06f, 1f));
            // Phase two keeps its red face; hits still get the shake, squash and flash.
            emblem.color = Color.Lerp(restingColor, new Color(1f, 0.68f, 0.68f, restingColor.a),
                envelope * 0.35f);
        }
        hitRemaining = Mathf.Max(0f, hitRemaining - Time.deltaTime);
    }

    private void RestoreTransform()
    {
        if (emblemRect == null) return;
        emblemRect.anchoredPosition = restingPosition;
        emblemRect.localScale = restingScale;
        emblem.color = restingColor;
    }
}
