using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;
using YARG;

public class GepetoVisualAnimator : MonoBehaviour
{
    [Header("Referências")]
    [SerializeField] private Image robotImage;
    [SerializeField] private BossHealthBar bossHealthBar;

    [Header("Sprites Cortados (Jogue todos em ordem aqui)")]
    [SerializeField] private List<Sprite> allSprites = new List<Sprite>();

    [Header("Velocidade da Animação (FPS)")]
    [SerializeField] private float animSpeed = 15f; // Aumente aqui se quiser mais rápido

    private int currentAnimationStart = 0;
    private int currentAnimationEnd = 7;
    private float timer = 0f;
    private int currentIndex = 0;
    private bool isTransitioning = false;

    private void Start()
    {
        if (robotImage == null) robotImage = GetComponent<Image>();
        if (bossHealthBar == null) bossHealthBar = GetComponent<BossHealthBar>();

        // Começa no Idle (0 a 7)
        SetAnimationRange(0, 7, true);
    }

    private void Update()
    {
        if (allSprites.Count == 0 || bossHealthBar == null) return;

        // Controle da velocidade e quadros da animação
        timer += Time.deltaTime * animSpeed;
        if (timer >= 1f)
        {
            timer = 0f;
            currentIndex++;

            if (currentIndex > currentAnimationEnd)
            {
                if (isTransitioning)
                {
                    float hpPercent = bossHealthBar.MaxHealth > 0f 
                        ? bossHealthBar.CurrentHealth / bossHealthBar.MaxHealth : 1f;
                    
                    if (hpPercent <= 0.5f)
                    {
                        SetAnimationRange(16, 23, true); // Fase 2 (Olho vermelho)
                    }
                    else
                    {
                        SetAnimationRange(0, 7, true); // Volta pro Idle
                    }
                    isTransitioning = false;
                }
                else
                {
                    currentIndex = currentAnimationStart; // Loop normal
                }
            }

            if (currentIndex < allSprites.Count && robotImage != null)
            {
                robotImage.sprite = allSprites[currentIndex];
            }
        }
    }

    public void SetAnimationRange(int start, int end, bool loop)
    {
        currentAnimationStart = start;
        currentAnimationEnd = end;
        currentIndex = start;
        isTransitioning = !loop;
    }

    public void TriggerHitAnimation()
    {
        float hpPercent = bossHealthBar.MaxHealth > 0f ? bossHealthBar.CurrentHealth / bossHealthBar.MaxHealth : 1f;

        // Toca a animação de Hit (Linha 2: 8 a 15)
        SetAnimationRange(8, 15, false);
        isTransitioning = true;
    }

    // Chamado pelo BossPhaseManager na ressurreição
    public void TriggerPhase2Transformation()
    {
        SetAnimationRange(16, 23, false);
        isTransitioning = true;
    }
}