using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UI; // Importante para reconhecer o componente Image

public class ReactionController : MonoBehaviour
{

    [Header("Expressões (Sprites)")]
    public Sprite normalSprite;  // Rosto feliz / neutro
    public Sprite missSprite;    // Rosto triste / reação de erro

    [Header("Configurações")]
    public float displayDuration = 1.5f; // Tempo na tela em segundos

    private Image uiImage;
    private Coroutine hideCoroutine;

    public event Action<int> NoteHit;

    private void Awake()
    {
        uiImage = GetComponent<Image>();
    }

    void Start()
    {
        if (uiImage != null && normalSprite != null)
        {
            uiImage.sprite = normalSprite;
        }
    }

    public void TriggerMissReaction()
    {
        if (uiImage == null || missSprite == null) return;

        uiImage.sprite = missSprite;

        if (hideCoroutine != null)
        {
            StopCoroutine(hideCoroutine);
        }

        hideCoroutine = StartCoroutine(ResetReactionRoutine());
    }

    public void TriggerHit(int lane)
    {
        NoteHit?.Invoke(lane);
    }

    private IEnumerator ResetReactionRoutine()
    {
        yield return new WaitForSeconds(displayDuration);

        if (normalSprite != null)
        {
            uiImage.sprite = normalSprite;
        }
    }

}