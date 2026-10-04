using UnityEngine;
using UnityEngine.UI;
using YARG.Gameplay;

namespace YARG
{
    public class BossHealthBar : MonoBehaviour
    {
        [Header("Configuração do Slider")]
        [SerializeField] private Slider healthSlider;
        [Min(1f)]
        [SerializeField] private float maxHealth = 100f;

        [Header("Combate baseado nas notas da faixa")]
        [Tooltip("Proporção de notas que um jogador solo precisa acertar para derrotar Gepeto.")]
        [Range(0.5f, 1f)]
        [SerializeField] private float soloTargetHitRate = 0.72f;
        [Tooltip("Janela em segundos para considerar um acerto muito preciso.")]
        [SerializeField] private float preciseHitWindow = 0.05f;
        [Tooltip("Janela em segundos para considerar um acerto bom.")]
        [SerializeField] private float goodHitWindow = 0.12f;
        [SerializeField] private float preciseDamageMultiplier = 1.15f;
        [SerializeField] private float goodDamageMultiplier = 1f;
        [SerializeField] private float looseDamageMultiplier = 0.7f;

        [Header("Velocidade de Suavização")]
        [SerializeField] private float healthBarSmoothSpeed = 250f;

        [SerializeField] private GepetoVisualAnimator visualAnimator;

        private float currentHealth;
        private float displayedHealth;
        private int expectedNoteCount;
        private int currentCombo;
        private bool transformed;

        public float CurrentHealth => currentHealth;
        public float MaxHealth => maxHealth;
        public bool IsDefeated { get; private set; }
        public event System.Action Defeated;

        public int CurrentPhase => transformed || currentHealth <= maxHealth * 0.5f ? 2 : 1;

        public void SetExpectedNoteCount(int noteCount)
        {
            expectedNoteCount = Mathf.Max(expectedNoteCount, noteCount);
        }

        private void Start()
        {
            currentHealth = maxHealth;
            IsDefeated = false;
            displayedHealth = currentHealth;

            if (healthSlider == null)
            {
                healthSlider = GetComponent<Slider>();
            }

            if (healthSlider != null)
            {
                healthSlider.maxValue = maxHealth;
                healthSlider.value = displayedHealth;
            }
        }

        private void Update()
        {
            if (healthSlider == null) return;

            float step = healthBarSmoothSpeed <= 0f
                ? Mathf.Abs(currentHealth - displayedHealth)
                : healthBarSmoothSpeed * Time.deltaTime;

            displayedHealth = Mathf.MoveTowards(displayedHealth, currentHealth, step);
            healthSlider.value = displayedHealth;
        }

        public void RegisterNoteHit(double noteTime, double hitTime, float damageMultiplier = 1f)
        {
            if (currentHealth <= 0f || expectedNoteCount <= 0) return;
            currentCombo++;

            float timingError = Mathf.Abs((float)(hitTime - noteTime));
            float timingMultiplier = timingError <= preciseHitWindow
                ? preciseDamageMultiplier
                : timingError <= goodHitWindow ? goodDamageMultiplier : looseDamageMultiplier;
            float comboMultiplier = currentCombo >= 30 ? 1.1f : currentCombo >= 10 ? 1.05f : 1f;
            float damagePerHit = maxHealth / (expectedNoteCount * Mathf.Max(0.01f, soloTargetHitRate));
            TakeDamage(damagePerHit * timingMultiplier * comboMultiplier * Mathf.Clamp01(damageMultiplier));
        }

        public float RecoverHealth(float amount)
        {
            if (IsDefeated || amount <= 0f) return 0f;
            float previousHealth = currentHealth;
            currentHealth = Mathf.Min(maxHealth, currentHealth + amount);
            return currentHealth - previousHealth;
        }

        public void RegisterNoteMiss()
        {
            if (IsDefeated) return;
            currentCombo = 0;
        }

        public void TakeDamage(float amount)
        {
            if (IsDefeated || amount <= 0f) return;
            float previousHealth = currentHealth;
            currentHealth -= amount;
            currentHealth = Mathf.Clamp(currentHealth, 0f, maxHealth);

            if (visualAnimator == null) visualAnimator = FindAnyObjectByType<GepetoVisualAnimator>();
            if (currentHealth <= 0f)
            {
                IsDefeated = true;
                visualAnimator?.TriggerDeathAnimation();
                Defeated?.Invoke();
                return;
            }
            if (visualAnimator != null && amount > 0f)
            {
                visualAnimator.TriggerHitAnimation();
            }

            if (!transformed && previousHealth > maxHealth * 0.5f && currentHealth <= maxHealth * 0.5f)
            {
                transformed = true;
                visualAnimator?.TriggerPhase2Transformation();
            }
        }

        public void HideDefeatedHealthBar()
        {
            if (IsDefeated && healthSlider != null)
            {
                var group = healthSlider.GetComponent<CanvasGroup>();
                if (group == null) group = healthSlider.gameObject.AddComponent<CanvasGroup>();
                group.alpha = 0f;
                group.interactable = false;
                group.blocksRaycasts = false;
            }
        }
    }
}
