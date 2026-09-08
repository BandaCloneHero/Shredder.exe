using UnityEngine;
using UnityEngine.UI;

public class NoteLedGlow : MonoBehaviour
{
    [Tooltip("Arraste o componente Image da moldura aqui")]
    [SerializeField] private Image ledBorderImage;

    [Tooltip("Ordem exata: 0=Verde, 1=Vermelho, 2=Amarelo, 3=Azul, 4=Laranja")]
    [SerializeField] private Sprite[] colorSprites;

    private ReactionController _reactionController;

    private void Awake()
    {
        if (ledBorderImage == null)
        {
            ledBorderImage = GetComponent<Image>();
        }

        _reactionController = GetComponentInParent<ReactionController>(true);
    }

    private void OnEnable()
    {
        if (_reactionController == null)
        {
            _reactionController = GetComponentInParent<ReactionController>(true);
        }

        if (_reactionController != null)
        {
            _reactionController.NoteHit += OnNoteHit;
        }
    }

    private void OnDisable()
    {
        if (_reactionController != null)
        {
            _reactionController.NoteHit -= OnNoteHit;
        }
    }

    private void OnNoteHit(int lane)
    {
        var colorIndex = lane switch
        {
            0 => 0,
            1 => 1,
            2 => 2,
            3 => 3,
            4 => 4,
            _ => -1
        };

        SetLedSprite(colorIndex);
    }

    // Método público para mudar a cor da moldura instantaneamente ao acertar uma nota
    public void SetLedSprite(int colorIndex)
    {
        if (ledBorderImage != null && colorSprites != null && colorIndex >= 0 && colorIndex < colorSprites.Length)
        {
            if (colorSprites[colorIndex] != null)
            {
                ledBorderImage.sprite = colorSprites[colorIndex];
            }
        }
    }
}