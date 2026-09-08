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

        [Header("Dano Constante (Notas) - Cócegas")]
        [Tooltip("Dano bem pequenininho aplicado por nota.")]
        [SerializeField] private float noteDamageAmount = 0.1f;
        [Tooltip("Intervalo mínimo de tempo entre os danos de nota para a barra não despencar.")]
        [SerializeField] private float noteDamageCooldown = 0.5f;

        [Header("Dano Crítico (Pontuação) - Deixa o Robô Putasso")]
        [Tooltip("Quantos pontos a banda precisa acumular para dar um dano crítico pesado.")]
        [SerializeField] private int scorePerCriticalHit = 25000;
        [Tooltip("Quanto de vida o dano crítico arranca de uma vez.")]
        [SerializeField] private float criticalDamageAmount = 5.0f;

        [Header("Velocidade de Suavização")]
        [SerializeField] private float healthBarSmoothSpeed = 250f;

        [SerializeField] private GepetoVisualAnimator visualAnimator;

        private float currentHealth;
        private float displayedHealth;
        private float nextNoteDamageTime;
        private int lastCheckedScore = 0;

        public float CurrentHealth => currentHealth;
        public float MaxHealth => maxHealth;

        public void TriggerResurrection(float newMaxHealthMultiplier, float newNoteDamageMultiplier)
        {
            maxHealth *= newMaxHealthMultiplier;
            currentHealth = maxHealth;
        }

        private void Start()
        {
            currentHealth = maxHealth;
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

        // Chamado pelas notas: Dano pequeno e cadenciado (NÃO deixa o robô putasso)
        public void RegisterNoteHit()
        {
            if (Time.unscaledTime < nextNoteDamageTime) return;

            nextNoteDamageTime = Time.unscaledTime + noteDamageCooldown;
            TakeDamage(noteDamageAmount);
        }

        // Chamado pelo Score: Dano crítico e pesado (RETORNA TRUE para o robô ficar putasso)
        public bool ProcessScoreForCritical(int currentScore)
        {
            currentScore = Mathf.Max(0, currentScore);

            // Verifica se a banda acumulou pontos o suficiente desde o último crítico
            if (currentScore - lastCheckedScore >= scorePerCriticalHit)
            {
                // Atualiza o marco de pontuação
                lastCheckedScore += scorePerCriticalHit;
                
                // Aplica o dano crítico pesado
                TakeDamage(criticalDamageAmount);
                
                // Retorna verdadeiro para avisar o script de reação que o boss deve ficar bravo!
                return true;
            }

            return false;
        }

        public void TakeDamage(float amount)
        {
            currentHealth -= amount;
            currentHealth = Mathf.Clamp(currentHealth, 0f, maxHealth);

            if (visualAnimator == null) visualAnimator = GetComponent<GepetoVisualAnimator>();
            if (visualAnimator != null && amount >= criticalDamageAmount)
            {
                visualAnimator.TriggerHitAnimation();
            }
        }
    }
}